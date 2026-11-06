const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const express = require('express');
const pool = require('../db');
const router = express.Router();
router.post("/register",(req,res)=>{
    const {name,email,password} = req.body;
    if(!name || !email || !password){
        return res.status(400).json({
            message: "name,email and password are required."
        })
        
    }
    if (password.length < 8) {
      return res.status(400).json({
        message : "response must contain atleast 8 characters."
      })
    }
    const normalizedEmail = email.trim().toLowerCase();
    const checkedEmailSql = "SELECT id FROM users WHERE email = ?";
    pool.query(checkedEmailSql,[normalizedEmail],(err,results)=>{
        if(err){
            console.error(err);
            return res.status(500).json({
                message : "database error"
            });
        }
        if(results.length > 0){
            return res.status(409).json({
                message : "email is already registered."
            });
        }
        bcrypt.hash(password,10,(hashError,hashedPassword)=>{
            if(hashError){
                console.error(err)
                return res.status(500).json({
                    message : "could not secure the password."
                });
            }
            const insertSql = ` INSERT INTO users (name,email,password)
            value (?,?,?)
            `
            pool.query(insertSql,[name.trim(),normalizedEmail,hashedPassword],(insertError,result)=>{
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
                     name: name.trim(),
                     email: normalizedEmail,
                   },
                 });
                
            })
        })

    })

})




router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
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
                message: "Database error."
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (compareError, isMatch) => {
            if (compareError) {
                console.error(compareError);
                return res.status(500).json({
                    message: "Could not verify password."
                });
            }

            if (!isMatch) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
            }

            if (!process.env.JWT_SECRET) {
                return res.status(500).json({
                    message: "Authentication is not configured."
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email
                },
                process.env.JWT_SECRET,
                { expiresIn: "1h" }
            );

            return res.status(200).json({
                message: "Login successful.",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            });
        });
    });
});


    
    






    router.get("/me",(req,res)=>{
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication token is required."
        });
    }
     const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            message: "Authentication is not configured."
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (tokenError, decoded) => {
        if (tokenError) {
            return res.status(401).json({
                message: "Invalid or expired token."
            });
        }

        const sql = `
            SELECT id, name, email, created_at
            FROM users
            WHERE id = ?
        `;

        pool.query(sql, [decoded.id], (error, results) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Database error."
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    message: "User not found."
                });
            }
             return res.status(200).json({
                user: results[0]
            });
        });
    });
});

module.exports = router;

    
    