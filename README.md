# BA Marketplace — Minimal Multi‑Vendor JavaScript E‑Commerce

A fast and simple marketplace built with **Node.js (Express)** and **Vanilla JS**.  
Includes **Admin**, **Vendor**, and **Customer** panels + **PDF invoice** generator and **Backup/Import**.

## Quick Start
```bash
cd mv-marketplace
npm install
npm run start
# open http://localhost:3000
```

## Default Demo Accounts
- **Admin** — `admin@local` / `admin123`
- **Vendor** — `vendor@local` / `vendor123` (already active)
- **Customer** — `customer@local` / `customer123`

## Features
- Admin
  - Approve/Block/Delete users, edit details
  - Manage categories
  - Add/Edit/Delete banners & slides (URL + position fields)
  - View all orders & set status
  - **Backup** database JSON & **Import** from JSON
- Vendor
  - Set store name, phone, address
  - Add shipping methods (name + rate)
  - Add/Edit/Delete products (title, price, category, stock, image URL)
- Customer
  - Add addresses
  - Cart on storefront (`/index.html`)
  - Place order (shipping calculated **per vendor** and added to invoice)
  - See orders + open **Invoice PDF**
- Storefront
  - Home shows slides/banners, categories, product grid
  - Simple search & category filter

## Notes
- Data is stored in `data/db.json` (file-based).
- Uploaded images are served from `/uploads`.
- Update `JWT_SECRET` in environment for production.

## Deploy
- Behind a reverse proxy (Nginx/Apache), serve Node on a private port.
- Use a process manager like `pm2` or `systemd`.
- Back up `data/db.json` regularly (or via the **Backup** button).

Enjoy!
