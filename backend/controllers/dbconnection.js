const mongoose = require('mongoose');

const connectToMongoDB = async () => {
    try {
        await mongoose.connect('mongodb+srv://kanav:kanav123@cluster0.fxgpn.mongodb.net/scalable-chat');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err.message);
    }
};

module.exports = { connectToMongoDB };
