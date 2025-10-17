const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({limit:'5mb'}));
app.use(express.urlencoded({extended:true}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/', express.static(path.join(__dirname, 'public')));

// Multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    const ext = path.extname(file.originalname || '.png');
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// -------- Helpers
function loadDB(){
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function saveDB(db){
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function auth(role=null){
  return (req,res,next)=>{
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if(!token) return res.status(401).json({error:'No token'});
    try{
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      if(role && payload.role !== role) return res.status(403).json({error:'Forbidden'});
      next();
    }catch(e){ return res.status(401).json({error:'Invalid token'}); }
  }
}
function newId(prefix){ return prefix + Math.random().toString(36).slice(2,9); }

// -------- Auth
app.post('/api/auth/register', (req,res)=>{
  const { role='customer', email, password, name } = req.body;
  if(!email || !password) return res.status(400).json({error:'email & password required'});
  const db = loadDB();
  if(db.users.find(u=>u.email===email)) return res.status(400).json({error:'email exists'});
  const u = { id:newId('u_'), role, email, password, name: name||email, status: role==='vendor'?'pending':'active' };
  if(role==='vendor') u.store = {name:'',phone:'',address:''}, u.shipping = [];
  if(role==='customer') u.addresses = [];
  db.users.push(u); saveDB(db);
  res.json({ok:true, user:u});
});

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body;
  const db = loadDB();
  const u = db.users.find(x=>x.email===email && x.password===password);
  if(!u) return res.status(400).json({error:'invalid credentials'});
  if(u.status!=='active') return res.status(403).json({error:'account not active'});
  const token = jwt.sign({id:u.id, role:u.role, email:u.email}, JWT_SECRET, {expiresIn:'7d'});
  res.json({token, user:{id:u.id, role:u.role, email:u.email, name:u.name}});
});

// -------- Admin
app.get('/api/admin/users', auth('admin'), (req,res)=>{
  const db = loadDB();
  res.json(db.users);
});
app.post('/api/admin/users/:id/status', auth('admin'), (req,res)=>{
  const { id } = req.params; const { status } = req.body;
  const db = loadDB();
  const u = db.users.find(x=>x.id===id);
  if(!u) return res.status(404).json({error:'not found'});
  u.status = status || u.status; saveDB(db); res.json(u);
});
app.put('/api/admin/users/:id', auth('admin'), (req,res)=>{
  const { id } = req.params;
  const db = loadDB();
  const u = db.users.find(x=>x.id===id);
  if(!u) return res.status(404).json({error:'not found'});
  Object.assign(u, req.body); saveDB(db); res.json(u);
});
app.delete('/api/admin/users/:id', auth('admin'), (req,res)=>{
  const { id } = req.params;
  const db = loadDB();
  db.users = db.users.filter(x=>x.id!==id);
  // also clean vendor products
  db.products = db.products.filter(p=>p.vendorId!==id);
  saveDB(db); res.json({ok:true});
});

// categories
app.get('/api/admin/categories', auth('admin'), (req,res)=>{
  const db = loadDB(); res.json(db.categories);
});
app.post('/api/admin/categories', auth('admin'), (req,res)=>{
  const db = loadDB(); const {name} = req.body;
  const cat = {id:newId('cat'), name}; db.categories.push(cat); saveDB(db); res.json(cat);
});
app.put('/api/admin/categories/:id', auth('admin'), (req,res)=>{
  const db = loadDB(); const cat = db.categories.find(c=>c.id===req.params.id);
  if(!cat) return res.status(404).json({error:'not found'});
  Object.assign(cat, req.body); saveDB(db); res.json(cat);
});
app.delete('/api/admin/categories/:id', auth('admin'), (req,res)=>{
  const db = loadDB(); db.categories = db.categories.filter(c=>c.id!==req.params.id); saveDB(db); res.json({ok:true});
});

// banners/slides
app.get('/api/admin/banners', auth('admin'), (req,res)=>{
  const db = loadDB(); res.json(db.banners);
});
app.post('/api/admin/banners', auth('admin'), upload.single('image'), (req,res)=>{
  const db = loadDB();
  const {type='banner', position='', url='#'} = req.body;
  const fileUrl = req.file ? '/uploads/'+req.file.filename : (req.body.image || '');
  const b = {id:newId('b'), type, image:fileUrl, position, url}; db.banners.push(b); saveDB(db); res.json(b);
});
app.put('/api/admin/banners/:id', auth('admin'), upload.single('image'), (req,res)=>{
  const db = loadDB(); const b = db.banners.find(x=>x.id===req.params.id);
  if(!b) return res.status(404).json({error:'not found'});
  if(req.file){ b.image = '/uploads/'+req.file.filename; }
  Object.assign(b, req.body); saveDB(db); res.json(b);
});
app.delete('/api/admin/banners/:id', auth('admin'), (req,res)=>{
  const db = loadDB(); db.banners = db.banners.filter(x=>x.id!==req.params.id); saveDB(db); res.json({ok:true});
});

// backup/export
app.get('/api/admin/backup', auth('admin'), (req,res)=>{
  const dbRaw = fs.readFileSync(DB_PATH);
  res.setHeader('Content-Disposition','attachment; filename="backup-db.json"');
  res.type('application/json').send(dbRaw);
});
// import
app.post('/api/admin/import', auth('admin'), upload.single('file'), (req,res)=>{
  try{
    const json = JSON.parse(fs.readFileSync(req.file.path,'utf-8'));
    fs.writeFileSync(DB_PATH, JSON.stringify(json, null, 2));
    res.json({ok:true});
  }catch(e){
    res.status(400).json({error:'invalid backup'});
  }
});

// -------- Vendor
app.get('/api/vendor/me', auth('vendor'), (req,res)=>{
  const db = loadDB();
  const v = db.users.find(u=>u.id===req.user.id);
  res.json(v);
});
app.put('/api/vendor/me', auth('vendor'), (req,res)=>{
  const db = loadDB();
  const v = db.users.find(u=>u.id===req.user.id);
  Object.assign(v.store, req.body.store||{});
  v.shipping = req.body.shipping || v.shipping;
  saveDB(db); res.json(v);
});
// vendor products
app.get('/api/vendor/products', auth('vendor'), (req,res)=>{
  const db = loadDB(); res.json(db.products.filter(p=>p.vendorId===req.user.id));
});
app.post('/api/vendor/products', auth('vendor'), upload.single('image'), (req,res)=>{
  const db = loadDB();
  const { title, price, categoryId, stock=0 } = req.body;
  const image = req.file ? '/uploads/'+req.file.filename : (req.body.image || '');
  const p = { id:newId('p'), vendorId:req.user.id, title, price:+price, categoryId, stock:+stock, image };
  db.products.push(p); saveDB(db); res.json(p);
});
app.put('/api/vendor/products/:id', auth('vendor'), upload.single('image'), (req,res)=>{
  const db = loadDB(); const p = db.products.find(x=>x.id===req.params.id && x.vendorId===req.user.id);
  if(!p) return res.status(404).json({error:'not found'});
  if(req.file){ p.image = '/uploads/'+req.file.filename; }
  Object.assign(p, req.body); if(req.body.price) p.price = +req.body.price;
  if(req.body.stock) p.stock = +req.body.stock;
  saveDB(db); res.json(p);
});
app.delete('/api/vendor/products/:id', auth('vendor'), (req,res)=>{
  const db = loadDB(); db.products = db.products.filter(x=>!(x.id===req.params.id && x.vendorId===req.user.id)); saveDB(db); res.json({ok:true});
});

// -------- Public (storefront)
app.get('/api/store/home', (req,res)=>{
  const db = loadDB();
  res.json({ banners: db.banners, categories: db.categories, products: db.products });
});
app.get('/api/store/products', (req,res)=>{
  const db = loadDB();
  const { categoryId } = req.query;
  let ps = db.products;
  if(categoryId) ps = ps.filter(p=>p.categoryId===categoryId);
  res.json(ps);
});

// -------- Customer
app.get('/api/customer/me', auth('customer'), (req,res)=>{
  const db = loadDB(); const u = db.users.find(x=>x.id===req.user.id); res.json(u);
});
app.put('/api/customer/me', auth('customer'), (req,res)=>{
  const db = loadDB(); const u = db.users.find(x=>x.id===req.user.id);
  Object.assign(u, req.body);
  saveDB(db); res.json(u);
});
app.post('/api/customer/address', auth('customer'), (req,res)=>{
  const db = loadDB(); const u = db.users.find(x=>x.id===req.user.id);
  const addr = Object.assign({id:newId('addr')}, req.body); u.addresses = u.addresses || []; u.addresses.push(addr);
  saveDB(db); res.json(addr);
});
app.delete('/api/customer/address/:id', auth('customer'), (req,res)=>{
  const db = loadDB(); const u = db.users.find(x=>x.id===req.user.id);
  u.addresses = (u.addresses||[]).filter(a=>a.id!==req.params.id);
  saveDB(db); res.json({ok:true});
});

// place order (multi-vendor, per-vendor shipping accumulation)
app.post('/api/customer/orders', auth('customer'), (req,res)=>{
  const { items, addressId, shippingChoices } = req.body;
  // items: [{productId, qty}] ; shippingChoices: [{vendorId, methodName}]
  const db = loadDB();
  const u = db.users.find(x=>x.id===req.user.id);
  const address = (u.addresses||[]).find(a=>a.id===addressId);
  if(!address) return res.status(400).json({error:'Invalid address'});

  const productMap = new Map(db.products.map(p=>[p.id,p]));
  let total = 0;
  const groups = {}; // by vendor
  const lineItems = [];

  for(const it of items){
    const p = productMap.get(it.productId);
    if(!p) return res.status(400).json({error:`Product ${it.productId} not found`});
    const line = { productId:p.id, title:p.title, vendorId:p.vendorId, price:p.price, qty:it.qty };
    lineItems.push(line);
    total += p.price * it.qty;
    if(!groups[p.vendorId]) groups[p.vendorId] = [];
    groups[p.vendorId].push(line);
  }

  // shipping per vendor
  let shippingTotal = 0;
  const shippingBreakdown = [];
  for(const vendorId of Object.keys(groups)){
    const vendor = db.users.find(x=>x.id===vendorId);
    const choice = (shippingChoices||[]).find(s=>s.vendorId===vendorId);
    const method = (vendor.shipping||[]).find(m=>m.name === (choice ? choice.methodName : 'Standard')) || vendor.shipping?.[0];
    const rate = method ? +method.rate : 0;
    shippingTotal += rate;
    shippingBreakdown.push({vendorId, method: method ? method.name : null, rate});
  }

  const order = {
    id: newId('ord'),
    customerId: u.id,
    address,
    items: lineItems,
    createdAt: new Date().toISOString(),
    status: 'pending',
    shipping: { total: shippingTotal, breakdown: shippingBreakdown },
    total: +(total + shippingTotal).toFixed(2)
  };
  db.orders.push(order); saveDB(db);
  res.json(order);
});

// list my orders
app.get('/api/customer/orders', auth('customer'), (req,res)=>{
  const db = loadDB();
  const orders = db.orders.filter(o=>o.customerId===req.user.id);
  res.json(orders);
});

// admin list all orders
app.get('/api/admin/orders', auth('admin'), (req,res)=>{
  const db = loadDB(); res.json(db.orders);
});
app.post('/api/admin/orders/:id/status', auth('admin'), (req,res)=>{
  const db = loadDB(); const o = db.orders.find(x=>x.id===req.params.id);
  if(!o) return res.status(404).json({error:'not found'});
  o.status = req.body.status || o.status; saveDB(db); res.json(o);
});

// PDF invoice
app.get('/api/orders/:id/invoice.pdf', (req,res)=>{
  const db = loadDB(); const o = db.orders.find(x=>x.id===req.params.id);
  if(!o) return res.status(404).send('Not found');

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${o.id}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('BA Trading Marketplace Invoice', {align:'center'});
  doc.moveDown();
  doc.fontSize(12).text(`Invoice #: ${o.id}`);
  doc.text(`Date: ${new Date(o.createdAt).toLocaleString()}`);
  doc.text(`Status: ${o.status}`);
  doc.moveDown();
  doc.text('Bill To:');
  doc.text(`${o.address.label || ''}`);
  doc.text(`${o.address.line1 || ''}`);
  doc.text(`${o.address.city || ''}, ${o.address.country || ''}`);
  doc.text(`${o.address.phone || ''}`);
  doc.moveDown();

  // Table header
  doc.text('Items:', {underline:true});
  o.items.forEach(it=>{
    doc.text(`${it.title} x${it.qty} — $${it.price} (Vendor: ${it.vendorId})`);
  });
  doc.moveDown();
  doc.text(`Shipping: $${o.shipping.total}`);
  o.shipping.breakdown.forEach(s=>doc.text(` - Vendor ${s.vendorId}: ${s.method || 'N/A'} — $${s.rate}`));
  doc.moveDown();
  doc.fontSize(14).text(`TOTAL: $${o.total}`, {align:'right'});

  doc.end();
});

app.listen(PORT, ()=> console.log('Server running at http://localhost:'+PORT));
