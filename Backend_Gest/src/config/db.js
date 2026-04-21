const sql = require('mssql')
const { EXPECTED_DATABASE } = require('../constants')

const sqlConfig = {
  server:   process.env.DB_SERVER,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || EXPECTED_DATABASE,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
  },
}

let poolPromise = null
let activePool  = null

function hasSqlConfig() {
  return (
    typeof sqlConfig.server   === 'string' && sqlConfig.server.trim().length   > 0 &&
    typeof sqlConfig.user     === 'string' && sqlConfig.user.trim().length     > 0 &&
    typeof sqlConfig.password === 'string' && sqlConfig.password.trim().length > 0 &&
    typeof sqlConfig.database === 'string' && sqlConfig.database.trim().length > 0
  )
}

async function getPool() {
  if (!hasSqlConfig()) return null
  if (sqlConfig.database !== EXPECTED_DATABASE) {
    console.error(
      `Base de datos incorrecta: DB_DATABASE esta configurada como ${sqlConfig.database}; se esperaba ${EXPECTED_DATABASE}`
    )
    return null
  }
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .then((pool) => {
        activePool = pool
        console.log(`Conexión exitosa a la base de datos ${sqlConfig.database}`)
        return pool
      })
      .catch((err) => {
        console.error(
          `Error conectando a la base de datos ${sqlConfig.database}:`,
          err?.message || err
        )
        poolPromise = null
        activePool  = null
        return null
      })
  }
  return await poolPromise
}

async function resetSqlPool() {
  const pool = activePool || (poolPromise ? await poolPromise.catch(() => null) : null)
  if (pool) {
    await pool.close()
  }
  poolPromise = null
  activePool  = null
}

async function testDatabaseConnection() {
  try {
    if (!hasSqlConfig()) {
      console.error(
        'Error conectando a la base de datos ControlTotal: faltan DB_SERVER/DB_USER/DB_PASSWORD/DB_DATABASE en .env'
      )
      return
    }

    const pool = await getPool()
    if (!pool) return

    const result = await pool.request().query('SELECT DB_NAME() AS database_name')
    const databaseName = result.recordset?.[0]?.database_name
    if (databaseName !== EXPECTED_DATABASE) {
      console.error(
        `Error conectando a la base de datos ControlTotal: la conexión activa apunta a ${databaseName}`
      )
      await resetSqlPool()
      return
    }

    console.log('Conexión exitosa a la base de datos ControlTotal')
  } catch (err) {
    console.error('Error conectando a la base de datos ControlTotal:', err?.message || err)
    await resetSqlPool()
  }
}

module.exports = { sqlConfig, getPool, resetSqlPool, testDatabaseConnection }
