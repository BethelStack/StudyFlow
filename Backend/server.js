const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const pool = require("./db");
require("./reminderScheduler");


const taskRoutes = require("./routes/tasks");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth");
const notificationRoutes = require("./routes/notifications");

app.use(cors());
app.use(express.json());

app.use("/tasks", taskRoutes);
app.use("/auth", authRoutes);
app.use("/notifications", notificationRoutes);



app.get("/", (req, res) => {
  console.log("server connected");
  res.send("hello there");
});

app.get("/api", (req, res) => {
  // res.json("hello there welcome to studyflow");
  console.log("it is working");
  res.status(200).send("server is working");
});


app.use((req, res, next) => {
  res.status(404).json({
    message: "Route not found",
  });
});


app.use(errorHandler);



// Add reminder columns only when they do not exist
function addReminderColumns() {
  const columns = [
    {
      name: "reminder_at",
      definition: "DATETIME NULL",
    },
    {
      name: "reminder_sent",
      definition: "BOOLEAN NOT NULL DEFAULT FALSE",
    },
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



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});

