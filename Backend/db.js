const mysql = require("mysql2");
require("dotenv").config();






const pool = mysql.createPool({
  host:process.env.DB_HOST,
  user:process.env.DB_USER,
  password:process.env.DB_PASSWORD,
  database:process.env.DB_NAME,
  waitForConnections:true,
  connectionLimit:10,
  queueLimit:0
})
// pool.connect((err) => {
//   if (err) {
//     console.log(err);
//     return;
//   }
  
// });
const create = `CREATE TABLE  IF NOT EXISTS tasks (
    id int auto_increment PRIMARY KEY,
        title varchar(200) not null,
        description text,
        category varchar(200),
        priority varchar(200),
        status varchar(200) DEFAULT 'pending',
        due_date date,
        created_at timestamp DEFAULT current_timestamp
    ) `;
pool.query(create, (err) => {
  if (err) {
    console.log(err);
    return;
  }
  console.log("table created successfully");
});
const insert = `
INSERT INTO tasks (title, description, category, priority, status, due_date)
SELECT * FROM (
    SELECT 'Finish database assignment', 'Complete MySQL exercise',
           'University', 'high', 'pending', '2026-10-15'
) AS new_task
WHERE NOT EXISTS (
    SELECT 1 FROM tasks
    WHERE title = 'Finish database assignment'
);
`;

pool.query(insert, (err) => {
  if (err) throw err;
  console.log("Task inserted if it didn't already exist.");
});
const select = `SELECT * FROM tasks`;
pool.query(select,(err,results)=>{
    if(err) throw err;
    console.log(results);
    
});
const sql = `CREATE TABLE IF NOT EXISTS users(
   id INT  AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;
pool.query(sql, (err, result) => {
  if (err) {
    console.error("Error creating users table:", err);
    return;
  }
  console.log("Users table created successfully");
});

const alterSql = `ALTER TABLE tasks
  ADD COLUMN user_id INT
`;
pool.query(alterSql,(err,result)=>{
  if(err){
    if (err.code === "ER_DUP_FIELDNAME") {
            console.log("user_id column already exists");
            return;
  }
  console.log(err);
  return;
}
 console.log("user_id column added successfully");
});

// Add reminder columns only when they do not exist
function addReminderColumns() {
    const columns = [
        {
            name: "reminder_at",
            definition: "DATETIME NULL"
        },
        {
            name: "reminder_sent",
            definition: "BOOLEAN NOT NULL DEFAULT FALSE"
        }
    ];

    function addColumn(index) {
        if (index >= columns.length) {
            console.log("Reminder columns are ready.");
            return;
        }

        const column = columns[index];

        const checkSql = `
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tasks'
            AND COLUMN_NAME = ?
        `;

        pool.query(checkSql, [column.name], (err, results) => {
            if (err) {
                console.error(err);
                return;
            }

            if (results.length > 0) {
                console.log(`${column.name} already exists.`);
                return addColumn(index + 1);
            }

            const alterSql = `
                ALTER TABLE tasks
                ADD COLUMN ${column.name} ${column.definition}
            `;

            pool.query(alterSql, (alterError) => {
                if (alterError) {
                    console.error(alterError);
                    return;
                }

                console.log(`${column.name} added.`);
                addColumn(index + 1);
            });
        });
    }

    addColumn(0);
}

addReminderColumns();




const createNotificationsTable = `
    CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        task_id INT,
        message VARCHAR(255) NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;

pool.query(createNotificationsTable, (err) => {
  if (err) {
    console.error("Error creating notifications table:", err.message);
    return;
  }

  console.log("Notifications table is ready.");
});

module.exports = pool;
