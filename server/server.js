const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise'); // Uncomment when you set up MySQL

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your_super_secret_key_change_in_production';

// Database Connection Pool
const pool = mysql.createPool({
    host: 'https://unstuffed-kelp-stencil.ngrok-free.dev',
    port: '5000',
    user: 'root',
    password: '',
    database: 'attendance_db'
});


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        req.user = user;
        next();
    });
};

app.post('/api/register', async(req, res) => {
    // 1. Get email, password, name, role from req.body
    // 2. Hash password: const hashedPassword = await bcrypt.hash(password, 10);
    // 3. Insert into Users table. If teacher, insert into Teachers. If student, insert into Students.
    res.json({ message: "User registered (Implement DB logic here)" });
});

app.post('/api/login', async(req, res) => {
    // 1. Fetch user by email
    // 2. Compare password: await bcrypt.compare(req.body.password, user.password)
    // 3. Generate Token: const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    // 4. Return token and user data
    res.json({ token: "sample_jwt_token", message: "Login endpoint" });
});

app.post('/api/courses', authenticateToken, async(req, res) => {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: "Teachers only" });

    // Generate unique 6-8 char code
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Insert into Courses table with req.user.id as teacher_id
    res.json({ message: "Course created", joinCode });
});

app.post('/api/join-course', authenticateToken, async(req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: "Students only" });

    const { joinCode } = req.body;
    // 1. Find course by joinCode
    // 2. Insert into Enrollments (student_id, course_id)
    res.json({ message: "Course joined" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});