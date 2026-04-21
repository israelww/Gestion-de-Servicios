const sql = require('mssql')
const { toTrimmedString } = require('../helpers/sqlHelpers')

// ─── Configuración del motor ──────────────────────────────────────────────────

/** Máximo de tickets activos por técnico antes de excluirlo del pool */
const MAX_TICKETS_POR_TECNICO = 5

/** Mapea el número de día JS (0=Dom … 6=Sáb) a la clave del JSON de horario */
const DIA_KEY = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

// ─── tecnicoEstaEnHorario ─────────────────────────────────────────────────────

/**
 * Determina si un técnico está disponible ahora según su horario JSON.
 * @param {string|null} horarioJson  Valor del campo Tecnico.horario
 * @param {Date}        now          Fecha/hora actual
 * @returns {boolean}
 */
function tecnicoEstaEnHorario(horarioJson, now) {
  if (!horarioJson) return false
  let horario
  try {
    horario = typeof horarioJson === 'string' ? JSON.parse(horarioJson) : horarioJson
  } catch {
    return false
  }

  const diaKey = DIA_KEY[now.getDay()]
  const slot   = horario[diaKey]
  if (!slot || !slot.activo) return false

  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= toMinutes(slot.inicio) && nowMin < toMinutes(slot.fin)
}

// ─── autoAssignTecnico ────────────────────────────────────────────────────────

/**
 * Motor de asignación automática.
 *
 * Debe llamarse DENTRO de una transacción activa (SERIALIZABLE).
 * Usa UPDLOCK + HOLDLOCK para evitar que dos tickets concurrentes
 * asignen al mismo técnico simultáneamente.
 *
 * @param {sql.Transaction} transaction
 * @param {string}          id_mantenimiento  Ticket recién creado
 * @param {string}          id_area           Área del problema (filtro obligatorio)
 * @param {string}          id_edificio       Edificio del CI (para bono de proximidad)
 * @param {Date}            now               Momento de la asignación
 * @returns {Promise<{asignado: boolean, id_tecnico?: string, razon?: string}>}
 */
async function autoAssignTecnico(transaction, id_mantenimiento, id_area, id_edificio, now) {
  // Obtener nombre del área para el log
  const areaNombreResult = await new sql.Request(transaction)
    .input('id_area_log', sql.Char(10), id_area)
    .query(`SELECT nombre_area FROM Areas WHERE id_area = @id_area_log`)
  const nombreArea = toTrimmedString(areaNombreResult.recordset?.[0]?.nombre_area) || id_area

  // Obtener nombre del edificio para el log
  const edificioNombreResult = await new sql.Request(transaction)
    .input('id_edificio_log', sql.Char(10), id_edificio)
    .query(`SELECT nombre_edificio FROM Edificios WHERE id_edificio = @id_edificio_log`)
  const nombreEdificio = toTrimmedString(edificioNombreResult.recordset?.[0]?.nombre_edificio) || id_edificio

  // 1. Consultar candidatos bloqueando filas (UPDLOCK + HOLDLOCK)
  const candidatesResult = await new sql.Request(transaction)
    .input('id_area',     sql.Char(10), id_area)
    .input('id_edificio', sql.Char(10), id_edificio)
    .input('max_tickets', sql.Int,      MAX_TICKETS_POR_TECNICO)
    .query(`
      SELECT
        tc.id_usuario       AS id_tecnico,
        u.nombre_completo   AS nombre_tecnico,
        tc.horario,
        COUNT(m.id_mantenimiento)                                    AS carga_activa,
        MAX(CASE WHEN e.id_edificio = @id_edificio THEN 1 ELSE 0 END) AS mismo_edificio
      FROM Tecnico tc WITH (UPDLOCK, HOLDLOCK)
      LEFT JOIN Usuarios u
        ON  u.id_usuario = tc.id_usuario
      LEFT JOIN Mantenimientos m WITH (UPDLOCK)
        ON  m.id_tecnico_asignado = tc.id_usuario
        AND m.estado IN ('Pendiente', 'Asignado', 'En Proceso')
      LEFT JOIN Elementos_Configuracion ci_m
        ON  ci_m.id_ci = m.id_ci
      LEFT JOIN Sublocalizaciones s_m
        ON  s_m.id_sublocalizacion = ci_m.id_sublocalizacion
      LEFT JOIN Edificios e
        ON  e.id_edificio = s_m.id_edificio
      WHERE tc.id_area = @id_area
      GROUP BY tc.id_usuario, u.nombre_completo, tc.horario
      HAVING COUNT(m.id_mantenimiento) < @max_tickets
      ORDER BY tc.id_usuario
    `)

  const candidatos = candidatesResult.recordset || []

  // 2. Filtrar por horario laboral
  const disponibles = candidatos.filter((c) => tecnicoEstaEnHorario(c.horario, now))

  if (candidatos.length === 0) {
    console.log(`[AutoAsign] Ticket ${id_mantenimiento} | Area="${nombreArea}" Edificio="${nombreEdificio}" | Sin tecnicos con esa area o todos en carga maxima (>${MAX_TICKETS_POR_TECNICO})`)
    return { asignado: false, razon: 'sin_tecnicos_area_o_carga_maxima' }
  }
  if (disponibles.length === 0) {
    console.log(`[AutoAsign] Ticket ${id_mantenimiento} | ${candidatos.length} tecnico(s) con area correcta pero NINGUNO en horario ahora (${new Date().toLocaleTimeString()})`)
    candidatos.forEach((c) =>
      console.log(`  - ${toTrimmedString(c.nombre_tecnico) || c.id_tecnico} | carga=${c.carga_activa}`)
    )
    return { asignado: false, razon: 'fuera_de_horario' }
  }

  // 3. Calcular Score: (carga_activa * -10) + (mismo_edificio * 5)
  const scored = disponibles.map((c) => ({
    id_tecnico:     c.id_tecnico,
    nombre_tecnico: toTrimmedString(c.nombre_tecnico) || c.id_tecnico,
    score:          (Number(c.carga_activa) * -10) + (Number(c.mismo_edificio) * 5),
    carga_activa:   Number(c.carga_activa),
    mismo_edificio: Number(c.mismo_edificio),
  }))

  // Mayor score primero; empate → menor id_tecnico
  scored.sort((a, b) => b.score - a.score || a.id_tecnico.localeCompare(b.id_tecnico))
  const mejor = scored[0]

  // Log de decisión
  console.log(`\n╔═══ AutoAsign | Ticket: ${id_mantenimiento} ═══════════════════════════`)
  console.log(`║  Area del problema : ${nombreArea}`)
  console.log(`║  Edificio del CI   : ${nombreEdificio}`)
  console.log(`║  Hora de asignacion: ${new Date().toLocaleTimeString()}`)
  console.log(`║  Candidatos evaluados (${scored.length}):`)
  scored.forEach((c, i) => {
    const marca = i === 0 ? '★ ELEGIDO' : '         '
    console.log(`║    ${marca} ${c.nombre_tecnico} | carga=${c.carga_activa} | mismo_edificio=${c.mismo_edificio} | score=${c.score}`)
  })
  console.log(`╚══ Asignado a: ${mejor.nombre_tecnico} (score ${mejor.score}) ${'═'.repeat(20)}\n`)

  // 4. Asignar el ticket
  await new sql.Request(transaction)
    .input('id_mantenimiento',    sql.Char(10),  id_mantenimiento)
    .input('id_tecnico_asignado', sql.Char(15),  mejor.id_tecnico)
    .input('fecha_asignacion',    sql.DateTime,  new Date())
    .query(`
      UPDATE Mantenimientos
      SET id_tecnico_asignado = @id_tecnico_asignado,
          fecha_asignacion    = COALESCE(fecha_asignacion, @fecha_asignacion),
          estado              = 'Asignado'
      WHERE id_mantenimiento = @id_mantenimiento
    `)

  return {
    asignado:            true,
    id_tecnico:          mejor.id_tecnico,
    score:               mejor.score,
    candidatos_evaluados: scored,
  }
}

module.exports = { autoAssignTecnico, tecnicoEstaEnHorario, MAX_TICKETS_POR_TECNICO, DIA_KEY }
