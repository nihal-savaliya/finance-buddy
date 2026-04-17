const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  merchant: { type: String, required: true },
  category: { type: String, default: 'other' },
  date: { type: String, required: true },
  userId: { type: String, required: true } // <-- ADD THIS LINE
});

module.exports = mongoose.model('Transaction', TransactionSchema);