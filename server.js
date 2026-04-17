const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const Transaction = require('./models/Transaction');
const Goal = require('./models/Goal');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// --- Initialize AI Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  tools: [{ googleSearch: {} }]
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- Root route: serve index.html ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ══════════════════════════════════════════════════════════════════
//                    AUTHENTICATION ROUTES
// ══════════════════════════════════════════════════════════════════

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password required'
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword
    });

    await newUser.save();

    res.json({
      success: true,
      message: 'User created. Please log in.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Signup failed'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      username: user.username
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// --- Auth Middleware ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No Token'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      message: 'Invalid Token'
    });
  }
};

// Protect all /api routes below this point except /api/auth
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  verifyToken(req, res, next);
});

// ══════════════════════════════════════════════════════════════════
//                    AI ROUTES (GROQ + GEMINI)
// ══════════════════════════════════════════════════════════════════

app.post('/api/sms', async (req, res) => {
  try {
    const { rawText } = req.body;

    if (!rawText) {
      return res.status(400).json({
        success: false,
        message: "No text provided"
      });
    }

    const smsPrompt = `You are a bank SMS parser. Analyze this SMS: "${rawText}"
RULES:
1. EXPENSE: "debited", "spent", "paid", "sent". Amount must be NEGATIVE. Category: food, travel, bills, shopping, entertainment, health, other.
2. INCOME: "credited", "received", "added". Amount must be POSITIVE. Category: income.
3. Extract merchant.
Output ONLY valid JSON matching this schema exactly: {"amount": number, "merchant": "string", "category": "string"}`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: smsPrompt }],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);

    if (typeof parsed.amount !== 'number' || !parsed.merchant) {
      return res.status(400).json({
        success: false,
        message: "Could not parse SMS completely."
      });
    }

    const newTxn = new Transaction({
      amount: parsed.amount,
      merchant: parsed.merchant,
      category: parsed.category || 'other',
      date: new Date().toISOString().slice(0, 10),
      userId: req.user.id
    });

    await newTxn.save();

    res.json({
      success: true,
      transaction: newTxn
    });
  } catch (error) {
    console.error("Groq SMS Parsing Error:", error);
    res.status(500).json({
      success: false,
      message: "AI categorization failed."
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const routerPrompt = `Analyze the user's message: "${message}"
Determine if they are logging expenses, adding income, setting a goal, or just asking a general question.
If they mention multiple expenses in one sentence, split them into an array of separate items. If they give a total amount for multiple items without specifying individual prices, divide the amount evenly.
Reply ONLY with valid JSON.

CRITICAL CATEGORY RULE:
For expenses, you MUST choose exactly ONE category per item from this exact list: food, travel, bills, shopping, entertainment, health, other.
Do NOT make up new categories or combine them.

Format for expenses:
{"action": "addExpenses", "expenses": [{"amount": 350, "merchant": "Bus", "category": "travel"}, {"amount": 350, "merchant": "Shopping", "category": "shopping"}], "reply": "Got it! Logged expenses."}

Format for income:
{"action": "addIncome", "amount": 1000, "merchant": "Salary", "category": "income", "reply": "Added ₹1000 to your balance."}

Format for goal:
{"action": "setGoal", "name": "Car", "amount": 50000, "deadline": "2026-12-31", "reply": "Goal set for Car!"}

Format for general questions:
{"action": "chat", "reply": ""}`;

    const groqResponse = await groq.chat.completions.create({
      messages: [{ role: "user", content: routerPrompt }],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const aiCommand = JSON.parse(groqResponse.choices[0].message.content);

    if (aiCommand.action === 'addExpenses') {
      const savedTxns = [];

      for (let exp of aiCommand.expenses) {
        const newTxn = new Transaction({
          amount: -Math.abs(exp.amount),
          merchant: exp.merchant || 'Unknown',
          category: exp.category || 'other',
          date: new Date().toISOString().slice(0, 10),
          userId: req.user.id
        });

        await newTxn.save();
        savedTxns.push(newTxn);
      }

      aiCommand.savedTxns = savedTxns;
      return res.json({ success: true, data: aiCommand });
    }

    if (aiCommand.action === 'addIncome') {
      const newTxn = new Transaction({
        amount: Math.abs(aiCommand.amount),
        merchant: aiCommand.merchant || 'Unknown',
        category: 'income',
        date: new Date().toISOString().slice(0, 10),
        userId: req.user.id
      });

      await newTxn.save();
      return res.json({ success: true, data: aiCommand });
    }

    if (aiCommand.action === 'setGoal') {
      const newGoal = new Goal({
        name: aiCommand.name,
        target: aiCommand.amount,
        saved: 0,
        deadline: aiCommand.deadline || null,
        userId: req.user.id
      });

      await newGoal.save();
      aiCommand.goalId = newGoal._id;

      return res.json({ success: true, data: aiCommand });
    }

    if (aiCommand.action === 'chat') {
      const allTxns = await Transaction.find({ userId: req.user.id });
      const totalBalance = allTxns.reduce((sum, t) => sum + t.amount, 0);

      const geminiPrompt = `
You are Finance Buddy. You have access to real-time Google Search to answer live questions.

User's Current Balance: ₹${totalBalance.toLocaleString('en-IN')}

User Message: "${message}"

Answer the user's question directly and conversationally. If they ask about current prices or news, use your search tool. If they ask about their finances, use the balance provided.
`;

      const result = await geminiModel.generateContent(geminiPrompt);
      const replyText = result.response.text();

      return res.json({
        success: true,
        data: { action: 'chat', reply: replyText }
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Unknown action returned by AI'
    });
  } catch (error) {
    console.error("Chat Router Error:", error);
    res.status(500).json({
      success: false,
      message: "AI encountered an error. Please try again."
    });
  }
});

// ══════════════════════════════════════════════════════════════════
//                    STANDARD API ROUTES (CRUD)
// ══════════════════════════════════════════════════════════════════

app.get('/api/transactions', async (req, res) => {
  try {
    const allTxns = await Transaction.find({ userId: req.user.id }).sort({ _id: -1 });
    res.json(allTxns);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch transactions" });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { amount, merchant, category, date } = req.body;
    const updateData = {};

    if (amount !== undefined) updateData.amount = amount;
    if (merchant !== undefined) updateData.merchant = merchant;
    if (category !== undefined) updateData.category = category;
    if (date !== undefined) updateData.date = date;

    const updated = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.json({
      success: true,
      transaction: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update transaction"
    });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const deleted = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not delete transaction"
    });
  }
});

app.get('/api/goals', async (req, res) => {
  try {
    const allGoals = await Goal.find({ userId: req.user.id });
    const allTxns = await Transaction.find({ userId: req.user.id });

    const totalBalance = allTxns.reduce((sum, t) => sum + t.amount, 0);
    const totalSurplus = totalBalance > 0 ? totalBalance : 0;
    const totalGoalTargets = allGoals.reduce((sum, g) => sum + g.target, 0);

    const goalsWithSavings = allGoals.map(g => {
      const autoSaved = totalGoalTargets > 0
        ? Math.round((g.target / totalGoalTargets) * totalSurplus)
        : 0;

      return {
        ...g.toObject(),
        saved: Math.min(autoSaved, g.target)
      };
    });

    res.json(goalsWithSavings);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch goals" });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const { name, target, saved, deadline } = req.body;

    if (!name || !target) {
      return res.status(400).json({
        success: false,
        message: "Name and target are required"
      });
    }

    const newGoal = new Goal({
      name,
      target,
      saved: saved || 0,
      deadline: deadline || null,
      userId: req.user.id
    });

    await newGoal.save();

    res.json({
      success: true,
      goal: newGoal
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not create goal"
    });
  }
});

app.put('/api/goals/:id', async (req, res) => {
  try {
    const { name, target, deadline } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (target !== undefined) updateData.target = target;
    if (deadline !== undefined) updateData.deadline = deadline;

    const updated = await Goal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Goal not found"
      });
    }

    res.json({
      success: true,
      goal: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update goal"
    });
  }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    const deleted = await Goal.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Goal not found"
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not delete goal"
    });
  }
});

app.get('/api/score', async (req, res) => {
  try {
    const txns = await Transaction.find({ userId: req.user.id });
    let totalSpent = 0;

    txns.forEach(txn => {
      if (txn.amount < 0) totalSpent += Math.abs(txn.amount);
    });

    const monthlyBudget = 50000;
    let score = 100 - Math.floor((totalSpent / monthlyBudget) * 100);

    if (score < 10) score = 10;
    if (score > 100) score = 100;

    res.json({
      success: true,
      score,
      totalSpent
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      score: 70
    });
  }
});

// ══════════════════════════════════════════════════════════════════
//                    DATABASE & SERVER START
// ══════════════════════════════════════════════════════════════════

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:');
    console.error(err);
  });