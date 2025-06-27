#!/bin/bash

# Test script for UUID migration verification
echo "🔬 Testing UUID Migration..."

# Base URL
BASE_URL="http://localhost:3000/api"

# First, create a test user (or login with existing)
echo "1. Creating/logging in test user..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass"}')

echo "Login response: $LOGIN_RESPONSE"

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token, trying to register..."
  REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"username": "testuser", "password": "testpass"}')
  
  echo "Register response: $REGISTER_RESPONSE"
  TOKEN=$(echo $REGISTER_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get authentication token"
  exit 1
fi

echo "✅ Got authentication token: ${TOKEN:0:20}..."

# 2. Create a test collection
echo "2. Creating test collection..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/collections" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "UUID Test Collection", "description": "Testing UUID migration"}')

echo "Create collection response: $CREATE_RESPONSE"

# Extract collection ID (which should now be a UUID)
COLLECTION_ID=$(echo $CREATE_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$COLLECTION_ID" ]; then
  echo "❌ Failed to create collection or extract ID"
  exit 1
fi

echo "✅ Created collection with ID: $COLLECTION_ID"

# 3. Check if the ID is a UUID (basic format check)
if [[ $COLLECTION_ID =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo "✅ Collection ID is in UUID format!"
else
  echo "⚠️ Collection ID is not in UUID format: $COLLECTION_ID"
fi

# 4. Test retrieving the collection by UUID
echo "3. Testing collection retrieval by UUID..."
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/collections/$COLLECTION_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Get collection response: $GET_RESPONSE"

# 5. Test getting collection stats
echo "4. Testing collection stats by UUID..."
STATS_RESPONSE=$(curl -s -X GET "$BASE_URL/collections/$COLLECTION_ID/stats" \
  -H "Authorization: Bearer $TOKEN")

echo "Collection stats response: $STATS_RESPONSE"

# 6. Test collection documents endpoint
echo "5. Testing collection documents by UUID..."
DOCS_RESPONSE=$(curl -s -X GET "$BASE_URL/collections/$COLLECTION_ID/documents" \
  -H "Authorization: Bearer $TOKEN")

echo "Collection documents response: $DOCS_RESPONSE"

# 7. Test updating collection by UUID
echo "6. Testing collection update by UUID..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/collections/$COLLECTION_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Updated UUID Test Collection", "description": "Updated via UUID"}')

echo "Update collection response: $UPDATE_RESPONSE"

# 8. Clean up - delete the test collection
echo "7. Cleaning up - deleting test collection..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/collections/$COLLECTION_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Delete collection response: $DELETE_RESPONSE"

echo "🎉 UUID Migration test completed!"
