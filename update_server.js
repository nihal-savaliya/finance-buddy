const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverFile, 'utf8');

// 1. Imports
content = content.replace(
  "const Goal = require('./models/Goal');\nrequire('dotenv').config();",
  "const Goal = require('./models/Goal');\nconst User = require('./models/User');\nconst bcrypt = require('bcryptjs');\nconst jwt = require('jsonwebtoken');\nrequire('dotenv').config();"
);

// 2. JWT_SECRET
content = content.replace(
  "const app = express();",
  "const app = express();\nconst JWT_SECRET = process.env.JWT_SECRET || 'supersecret';"
);

// 3. Auth Routes & Middleware
content = content.replace(
  "// ══════════════════════════════════════════════════════════════════\n//                    AI ROUTES (GROQ + GEMINI)",
  `// --- Auth Routes ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ success: false, message: 'Username already taken' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: 'User created. Please log in.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username: user.username });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// --- Auth Middleware ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Access Denied: No Token' });
  const token = authHeader.split(' ')[1];
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid Token' });
  }
};

// Protect all /api routes below this point (except auth)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  verifyToken(req, res, next);
});

// ══════════════════════════════════════════════════════════════════
//                    AI ROUTES (GROQ + GEMINI)`
);

// 4. Update new Transaction instances to include userId: req.user.id
content = content.replace(
  "category: parsed.category || 'other',\n      date: new Date().toISOString().slice(0, 10)\n    });",
  "category: parsed.category || 'other',\n      date: new Date().toISOString().slice(0, 10),\n      userId: req.user.id\n    });"
);

content = content.replace(
  "category: exp.category || 'other',\n          date: new Date().toISOString().slice(0, 10)\n        });",
  "category: exp.category || 'other',\n          date: new Date().toISOString().slice(0, 10),\n          userId: req.user.id\n        });"
);

content = content.replace(
  "category: 'income',\n        date: new Date().toISOString().slice(0, 10)\n      });",
  "category: 'income',\n        date: new Date().toISOString().slice(0, 10),\n        userId: req.user.id\n      });"
);

// 5. Update new Goal instances to include userId: req.user.id
content = content.replace(
  "saved: 0,\n        deadline: aiCommand.deadline || null\n      });",
  "saved: 0,\n        deadline: aiCommand.deadline || null,\n        userId: req.user.id\n      });"
);

// 6. Fix Transaction.find() queries
//   In /api/chat chat fallback
content = content.replace(
  "const allTxns = await Transaction.find();",
  "const allTxns = await Transaction.find({ userId: req.user.id });"
);

//   In /api/transactions GET
content = content.replace(
  "const allTxns = await Transaction.find().sort({ _id: -1 });",
  "const allTxns = await Transaction.find({ userId: req.user.id }).sort({ _id: -1 });"
);

//   In /api/goals GET
content = content.replace(
  "const allGoals = await Goal.find();\n    const allTxns = await Transaction.find();",
  "const allGoals = await Goal.find({ userId: req.user.id });\n    const allTxns = await Transaction.find({ userId: req.user.id });"
);

//   In /api/score GET
content = content.replace(
  "const txns = await Transaction.find();\n    let totalSpent = 0;",
  "const txns = await Transaction.find({ userId: req.user.id });\n    let totalSpent = 0;"
);

// 7. Fix standard CRUD Creation
//   In /api/goals POST
content = content.replace(
  "const newGoal = new Goal({ name, target, saved: saved || 0, deadline: deadline || null });",
  "const newGoal = new Goal({ name, target, saved: saved || 0, deadline: deadline || null, userId: req.user.id });"
);


// 8. Fix standard CRUD Update & Delete (ensure they only modify the user's records)
content = content.replace(/Transaction\.findByIdAndUpdate\(req\.params\.id, updateData, \{ new: true \}\)/g, "Transaction.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, updateData, { new: true })");
content = content.replace(/Transaction\.findByIdAndDelete\(req\.params\.id\)/g, "Transaction.findOneAndDelete({ _id: req.params.id, userId: req.user.id })");

content = content.replace(/Goal\.findByIdAndUpdate\(req\.params\.id, updateData, \{ new: true \}\)/g, "Goal.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, updateData, { new: true })");
content = content.replace(/Goal\.findByIdAndDelete\(req\.params\.id\)/g, "Goal.findOneAndDelete({ _id: req.params.id, userId: req.user.id })");

fs.writeFileSync(serverFile, content, 'utf8');
console.log("server.js updated successfully.");
