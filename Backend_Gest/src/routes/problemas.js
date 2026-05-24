const express = require('express')

const {
  compararIncidente,
  createConocimiento,
  createProblema,
  createSolicitudInvestigacion,
  getProblemasByCi,
  listIncidenciasInvestigacion,
  listIncidenciasPorTipo,
  listSolicitudesInvestigacion,
} = require('../controllers/problemasController')
const { requireAdmin, requireAdminOrTecnico, requireTecnico } = require('../middleware/auth')

const router = express.Router()

router.get('/problemas/solicitudes', ...requireAdminOrTecnico, listSolicitudesInvestigacion)
router.get('/problemas/incidencias', ...requireAdmin, listIncidenciasPorTipo)
router.get('/problemas/solicitudes/:id_solicitud/incidencias', ...requireAdminOrTecnico, listIncidenciasInvestigacion)
router.post('/problemas/solicitud', ...requireAdmin, createSolicitudInvestigacion)
router.post('/problemas/conocimiento', ...requireTecnico, createConocimiento)
router.post('/problemas', ...requireAdminOrTecnico, createProblema)
router.get('/problemas/:id_ci', ...requireAdminOrTecnico, getProblemasByCi)
router.post('/incidentes/comparar', ...requireAdminOrTecnico, compararIncidente)

module.exports = router
