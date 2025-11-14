#!/usr/bin/env python3
"""Test Qdrant upsert to identify the issue"""

from qdrant_client import QdrantClient
from qdrant_client.models import Batch
from uuid import UUID
import sys

# Connect to Qdrant
client = QdrantClient(url="http://localhost:6333")
collection_name = "knowledge"

# Create test data EXACTLY as our code does
document_id = UUID("12345678-1234-1234-1234-123456789012")
tenant_id = UUID("e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2")
kb_id = UUID("91802547-d183-49db-877d-71485be04795")

# Simulate 5 chunks with embeddings (3072 dimensions)
chunks = [f"Chunk {i} text content" for i in range(5)]
embeddings = [[float(j) for j in range(3072)] for i in range(5)]

# Build data structures EXACTLY as in qdrant_service.py
ids = []
vectors = []
payloads = []

for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
    # Use hash of document_id + index as integer ID
    point_id = abs(hash(f"{document_id}_{i}")) % (10 ** 18)

    ids.append(point_id)
    vectors.append(embedding)
    payloads.append({
        "tenant_id": str(tenant_id),
        "kb_id": str(kb_id),
        "doc_id": str(document_id),
        "chunk_text": chunk,
        "chunk_index": i
    })

print(f"✅ Created {len(ids)} points")
print(f"Sample ID type: {type(ids[0])}, value: {ids[0]}")
print(f"Sample vector type: {type(vectors[0])}, length: {len(vectors[0])}")
print(f"Sample payload: {payloads[0]}")
print()

# Try the Batch upsert
try:
    print("🔄 Attempting Batch upsert...")
    batch = Batch(
        ids=ids,
        vectors=vectors,
        payloads=payloads
    )
    print(f"✅ Batch created successfully")
    print(f"Batch model fields: {batch.model_fields.keys()}")

    # Now try the actual upsert
    result = client.upsert(
        collection_name=collection_name,
        wait=True,
        points=batch
    )
    print(f"✅ SUCCESS! Upserted {len(ids)} points")
    print(f"Result: {result}")

except Exception as e:
    print(f"❌ FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
