#!/bin/bash

# Create public/admin directory if it doesn't exist
mkdir -p public/admin

echo "✅ Created public/admin directory structure"
echo "📁 Admin dashboard should be accessible at:"
echo "   http://localhost:3000/admin/dashboard.html"
echo "   http://localhost:3000/admin/"
echo ""
echo "🔧 Make sure to restart your VSI service after adding the admin dashboard file"
