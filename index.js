/* FIRST BACKEND */
// Download required Libraries
//npm install mqtt express socket.io
//npm install mqtt --save
//I can either npm install or CDN

// Load environment variables from .env file
require('dotenv').config(); 

// Import required libraries
const mqtt = require('mqtt');
const fs = require('fs');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, set } = require('firebase/database');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for authentication
const serviceAccount = require(process.env.FIREBASE_KEY);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// Firebase configuration for the frontend SDK
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase for Realtime Database
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Establish MQTT Connection by setting up connection address, port and client ID
const protocol = 'mqtts';
const host = process.env.MQTT_HOST;
const port = process.env.MQTT_PORT;
const clientId = process.env.MQTT_CLIENT_ID;
const connectUrl = `${protocol}://${host}:${port}`;

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static('public'));

// Middleware to parse JSON
app.use(express.json());

// Call the built in function of the MQTT module to achieve connection
const client = mqtt.connect(connectUrl, {
    clientId,
    clean: true,
    connectTimeout: 4000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 1000,
    // If the server is using a self-signed certificate, you need to pass the CA.
    ca: fs.readFileSync(process.env.CA_CERT_PATH),
});

// Subscribe to MQTT Topic
const topic = process.env.MQTT_TOPIC;

client.on('connect', () => {
    console.log('Connected');
    client.subscribe([topic], () => {
        console.log(`Subscribe to topic '${topic}'`);
    });
});

// Monitor Incoming Messages
client.on('message', (topic, payload) => {
    console.log('Received Message:', payload.toString());
    try {
        const data = JSON.parse(payload.toString());
        if (data.temperature !== undefined && data.heart_rate !== undefined && data.blood_oxygen !== undefined && 
            data.blood_pressure !== undefined && data.longitude !== undefined && data.latitude !== undefined) {
            io.emit('sensorDataUpdate', { temperature: data.temperature, heart_rate: data.heart_rate, blood_oxygen: data.blood_oxygen, 
                blood_pressure: data.blood_pressure, longitude: data.longitude, latitude: data.latitude });
        } else {
            console.error('Invalid data format: Missing one or two fields');
        }
    } catch (e) {
        console.error('Failed to parse message:', e);
    }
});

// Firebase Authentication Endpoints
// Register a new user
app.post('/register', async (req, res) => {
    const { email, password, full_name } = req.body;

    try {
        const user = await admin.auth().createUser({
            email,
            password,
            displayName: full_name,
        });

        // Save additional user data to Firebase Realtime Database
        const userRef = ref(database, `users/${user.uid}`);
        await set(userRef, {
            email,
            full_name,
            last_login: new Date().toISOString(),
        });

        res.status(200).json({ message: 'User registered successfully!' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login a user
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await admin.auth().getUserByEmail(email);
        // You can add additional logic here (e.g., verify password)
        res.status(200).json({ message: 'Login successful!', user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Endpoint to serve the Google Maps API key
app.get('/api/google-maps-key', (req, res) => {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsKey) {
        return res.status(500).json({ error: 'Google Maps API key not found' });
    }
    res.json({ key: googleMapsKey });
});

//Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

/*Publish MQTT Messages
client.on('connect', () => {
    client.publish(topic, 'Hello this is a Website Connection Test', { qos: 0, retain: false }, (error) => {
        if (error) {
            console.error(error);
        }
    });
});*/
