const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

// REGISTER
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  // Validate input types
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      message: "Name, email and password are required.",
    });
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedName) {
    return res.status(400).json({
      message: "Name cannot be empty.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({
      message: "Please enter a valid email address.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must contain at least 8 characters.",
    });
  }

  // Check if email already exists
  const checkSql = "SELECT id FROM users WHERE email = ?";

  pool.query(checkSql, [normalizedEmail], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        message: "Database error.",
      });
    }

    if (results.length > 0) {
      return res.status(409).json({
        message: "Email is already registered.",
      });
    }

    // Hash password
    bcrypt.hash(password, 10, (hashError, hashedPassword) => {
      if (hashError) {
        console.error(hashError);
        return res.status(500).json({
          message: "Could not secure the password.",
        });
      }

      const insertSql = `
                INSERT INTO users (name, email, password)
                VALUES (?, ?, ?)
            `;

      pool.query(
        insertSql,
        [normalizedName, normalizedEmail, hashedPassword],
        (insertError, result) => {
          if (insertError) {
            console.error(insertError);

            if (insertError.code === "ER_DUP_ENTRY") {
              return res.status(409).json({
                message: "Email is already registered.",
              });
            }

            return res.status(500).json({
              message: "Could not create the account.",
            });
          }

          return res.status(201).json({
            message: "Account created successfully.",
            user: {
              id: result.insertId,
              name: normalizedName,
              email: normalizedEmail,
            },
          });
        },
      );
    });
  });
});

// LOGIN
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const sql = `
        SELECT id, name, email, password
        FROM users
        WHERE email = ?
    `;

  pool.query(sql, [normalizedEmail], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Database error.",
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const user = results[0];

    bcrypt.compare(password, user.password, (compareError, isMatch) => {
      if (compareError) {
        console.error(compareError);
        return res.status(500).json({
          message: "Could not verify password.",
        });
      }

      if (!isMatch) {
        return res.status(401).json({
          message: "Invalid email or password.",
        });
      }

      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          message: "Authentication is not configured.",
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" },
      );

      return res.status(200).json({
        message: "Login successful.",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    });
  });
});

// GET CURRENT LOGGED-IN USER
router.get("/me", authenticateToken, (req, res) => {
  const sql = `
        SELECT id, name, email, created_at
        FROM users
        WHERE id = ?
    `;

  pool.query(sql, [req.user.id], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Database error.",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.status(200).json({
      user: results[0],
    });
  });
});

module.exports = router;
