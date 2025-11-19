import requests
import json
import uuid

TENANT_ID = "00000000-0000-0000-0000-000000000001"
BASE_URL = "http://localhost:3009/api/v1"

def list_products(search_term=None):
    print(f"Listing products (search='{search_term}')...")
    headers = {"X-Tenant-Id": TENANT_ID}
    params = {}
    if search_term:
        params["search"] = search_term
        
    try:
        response = requests.get(f"{BASE_URL}/products", headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        print(f"Found {data.get('total', 0)} products")
        return data.get("products", [])
    except Exception as e:
        print(f"Error listing products: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return []

def create_order(product_id, quantity=1):
    print(f"\nCreating order for product {product_id} with quantity {quantity}...")
    headers = {
        "X-Tenant-Id": TENANT_ID,
        "Content-Type": "application/json"
    }
    
    payload = {
        "customer_phone": "081234567890",
        "customer_name": "Test User",
        "customer_address": "", # Pickup
        "items": [
            {
                "product_id": product_id,
                "quantity": quantity,
                "notes": "Test order"
            }
        ],
        "fulfillment_type": "pickup",
        "notes": "Test order from script"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/orders", headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error creating order: {e}")

if __name__ == "__main__":
    # Use a valid UUID with whitespace
    products = list_products("Kimchi Sawi")
    if products:
        product = products[0]
        product_id_with_space = f" {product['id']} "
        print(f"Testing with whitespace product ID: '{product_id_with_space}'")
        create_order(product_id_with_space, 2)
