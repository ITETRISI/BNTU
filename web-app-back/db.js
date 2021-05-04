const Pool = require('pg').Pool;

const pool = new Pool({
  user: "postgres",
  password: "asdfghjkl18Q",
  host: "localhost",
  port: 5432,
  database: 'BNTU'
})

module.exports = pool;


