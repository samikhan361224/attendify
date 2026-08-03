const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_in_production';

// Support full connection string (DATABASE_URL or MYSQL_URL) or individual credentials
const connectionString = process.env.DATABASE_URL || process.env.MYSQL_URL;

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    port: 4000,
    user: "29ush79pqxkXtBP.root",
    password: process.env.DB_PASSWORD,
    database: "attendance_db",
    waitForConnections: true,
    connectionLimit: 10,
    ssl: {
        rejectUnauthorized: true
    }
});


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized access. Token required." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token." });
        req.user = user;
        next();
    });
};

app.post('/api/register', async(req, res) => {
    try {
        const { name, email, password, role, studentId } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: "All required fields must be provided." });
        }

        const [existing] = await pool.query('SELECT id FROM Users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: "Email already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO Users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, role]
        );
        const userId = result.insertId;

        if (role === 'teacher') {
            await pool.query('INSERT INTO Teachers (user_id) VALUES (?)', [userId]);
        } else if (role === 'student') {
            await pool.query('INSERT INTO Students (user_id, student_number) VALUES (?, ?)', [userId, studentId || 'N/A']);
        }

        const token = jwt.sign({ id: userId, name, email, role }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: "Registration successful", token, user: { id: userId, name, email, role } });
    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ error: "Database error during registration." });
    }
});

app.post('/api/login', async(req, res) => {
    try {
        const { email, password, role } = req.body;
        const [users] = await pool.query('SELECT * FROM Users WHERE email = ? AND role = ?', [email, role]);

        if (users.length === 0) {
            return res.status(401).json({ error: "Invalid credentials or role mismatch." });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: "Database login failure." });
    }
});

app.post('/api/courses', authenticateToken, async(req, res) => {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: "Teacher role required." });

    try {
        const { name, code, description } = req.body;
        const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const [teachers] = await pool.query('SELECT teacher_id FROM Teachers WHERE user_id = ?', [req.user.id]);
        if (teachers.length === 0) return res.status(400).json({ error: "Teacher profile not found." });

        const teacherId = teachers[0].teacher_id;
        const [result] = await pool.query(
            'INSERT INTO Courses (teacher_id, course_name, course_code, join_code, description) VALUES (?, ?, ?, ?, ?)', [teacherId, name, code, joinCode, description || '']
        );

        res.status(201).json({ id: result.insertId, name, code, join_code: joinCode, description });
    } catch (err) {
        console.error('Create Course Error:', err);
        res.status(500).json({ error: "Failed to create course in cloud database." });
    }
});

app.post('/api/join-course', authenticateToken, async(req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: "Student role required." });

    try {
        const { joinCode } = req.body;
        const [courses] = await pool.query('SELECT course_id, course_name FROM Courses WHERE join_code = ?', [joinCode.toUpperCase()]);

        if (courses.length === 0) return res.status(404).json({ error: "Invalid Join Code." });

        const course = courses[0];
        const [students] = await pool.query('SELECT student_id FROM Students WHERE user_id = ?', [req.user.id]);
        if (students.length === 0) return res.status(400).json({ error: "Student profile not found." });

        const studentId = students[0].student_id;

        // Check duplicate enrollment
        const [enrolled] = await pool.query('SELECT id FROM Enrollments WHERE student_id = ? AND course_id = ?', [studentId, course.course_id]);
        if (enrolled.length > 0) return res.status(400).json({ error: "You are already enrolled in this course." });

        await pool.query('INSERT INTO Enrollments (student_id, course_id) VALUES (?, ?)', [studentId, course.course_id]);
        res.json({ message: `Successfully joined ${course.course_name}`, courseId: course.course_id });
    } catch (err) {
        console.error('Join Course Error:', err);
        res.status(500).json({ error: "Failed to join course." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});