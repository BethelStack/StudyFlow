const pool = require("./db");

const db = pool.promise();

// initializeDatabase()
//     .then(() => {

//         startReminderScheduler();

//         app.listen(PORT, () => {
//             console.log(`StudyFlow server running on port ${PORT}`);
//         });

//     })
//     .catch((error) => {
//         console.error("Could not start StudyFlow:", error);
//         process.exit(1);
//     });

async function columnExists(table, column) {
  const sql = `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `;

  const [results] = await db.query(sql, [table, column]);

  return results.length > 0;
}

async function addColumn(table, column, definition) {
  const exists = await columnExists(table, column);

  if (!exists) {
    await db.query(`
            ALTER TABLE ${table}
            ADD COLUMN ${column} ${definition}
        `);

    console.log(`${table}.${column} added.`);
  }
}

async function initializeDatabase() {
  try {
    // 1. Create users table
    await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // 2. Create tasks table
    await db.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                category VARCHAR(200),
                priority VARCHAR(200),
                status VARCHAR(200) DEFAULT 'pending',
                due_date DATE,
                user_id INT NULL,
                reminder_at DATETIME NULL,
                reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
                is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
                recurrence_interval ENUM('daily','weekly','monthly') NULL,
                recurring_task_id INT NULL,
                occurrence_date DATE NULL,
                next_occurrence_generated BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // 3. Add missing columns to existing tasks tables
    // This also supports your previous database structure.

    const taskColumns = [
      ["user_id", "INT NULL"],
      ["reminder_at", "DATETIME NULL"],
      ["reminder_sent", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["is_recurring", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["recurrence_interval", "ENUM('daily','weekly','monthly') NULL"],
      ["recurring_task_id", "INT NULL"],
      ["occurrence_date", "DATE NULL"],
      ["next_occurrence_generated", "BOOLEAN NOT NULL DEFAULT FALSE"],
    ];

    for (const [column, definition] of taskColumns) {
      await addColumn("tasks", column, definition);
    }

    // 4. Create notifications table
    await db.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                task_id INT NULL,
                message VARCHAR(255) NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}

module.exports = initializeDatabase;
