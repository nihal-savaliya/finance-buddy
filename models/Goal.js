const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  target: { type: Number, required: true },
  saved: { type: Number, default: 0 },
  deadline: { type: String, default: null },
  userId: { type: String, required: true } // <-- ADD THIS LINE
});

module.exports = mongoose.model('Goal', goalSchema);