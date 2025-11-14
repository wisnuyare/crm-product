from typing import List, Dict, Any
from uuid import UUID
import requests
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Batch, Filter, FieldCondition, MatchValue, MatchAny
from app.config import settings


class QdrantService:
    """Service for interacting with Qdrant vector database"""

    def __init__(self):
        self.client = QdrantClient(url=settings.qdrant_url)
        self.collection_name = settings.qdrant_collection
        self._ensure_collection_exists()

    def _ensure_collection_exists(self):
        """Create collection if it doesn't exist"""
        try:
            collections = self.client.get_collections().collections
            collection_names = [col.name for col in collections]

            if self.collection_name not in collection_names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=settings.embedding_dimension,
                        distance=Distance.COSINE
                    )
                )
                print(f"✅ Created Qdrant collection: {self.collection_name}")
            else:
                print(f"✅ Qdrant collection exists: {self.collection_name}")
        except Exception as e:
            print(f"⚠️  Warning: Could not ensure Qdrant collection: {e}")

    def upsert_vectors(
        self,
        document_id: UUID,
        tenant_id: UUID,
        kb_id: UUID,
        chunks: List[str],
        embeddings: List[List[float]]
    ) -> int:
        """Insert or update vectors in Qdrant"""
        print(f"\n\n🔍 === UPSERT_VECTORS CALLED ===")
        print(f"Document ID: {document_id}")
        print(f"Tenant ID: {tenant_id}")
        print(f"KB ID: {kb_id}")
        print(f"Chunks count: {len(chunks)}")
        print(f"Embeddings count: {len(embeddings)}")
        if embeddings:
            print(f"First embedding length: {len(embeddings[0])}")
            print(f"First embedding type: {type(embeddings[0])}")
        print(f"=================================\n\n")

        if len(chunks) != len(embeddings):
            raise ValueError("Number of chunks must match number of embeddings")

        # Prepare data for Batch upload
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

        # Upsert using direct REST API (bypassing Python client serialization issues)
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i:i + batch_size]
            batch_vectors = vectors[i:i + batch_size]
            batch_payloads = payloads[i:i + batch_size]

            # Prepare points in Qdrant REST API format
            points_data = []
            for point_id, vector, payload in zip(batch_ids, batch_vectors, batch_payloads):
                points_data.append({
                    "id": point_id,
                    "vector": vector,
                    "payload": payload
                })

            # Direct REST API call to Qdrant
            url = f"{settings.qdrant_url}/collections/{self.collection_name}/points"
            payload = {"points": points_data}

            # ULTRA DEBUG: Log everything
            import sys
            print(f"\n{'='*80}", file=sys.stderr, flush=True)
            print(f"QDRANT UPSERT DEBUG", file=sys.stderr, flush=True)
            print(f"URL: {url}", file=sys.stderr, flush=True)
            print(f"Number of points: {len(points_data)}", file=sys.stderr, flush=True)
            print(f"First point ID: {points_data[0]['id']}", file=sys.stderr, flush=True)
            print(f"First vector length: {len(points_data[0]['vector'])}", file=sys.stderr, flush=True)
            print(f"First vector type: {type(points_data[0]['vector'])}", file=sys.stderr, flush=True)
            print(f"First vector[0] type: {type(points_data[0]['vector'][0])}", file=sys.stderr, flush=True)
            print(f"First vector sample (first 5): {points_data[0]['vector'][:5]}", file=sys.stderr, flush=True)
            print(f"Payload keys: {list(points_data[0]['payload'].keys())}", file=sys.stderr, flush=True)

            # Check for NaN or Inf
            import math
            has_nan = any(math.isnan(v) or math.isinf(v) for v in points_data[0]['vector'])
            print(f"Contains NaN/Inf: {has_nan}", file=sys.stderr, flush=True)
            print(f"{'='*80}\n", file=sys.stderr, flush=True)

            response = requests.put(url, json=payload, params={"wait": "true"})

            if response.status_code != 200:
                print(f"ERROR Response: {response.text}", file=sys.stderr, flush=True)
                raise Exception(f"Qdrant upsert failed: {response.status_code} - {response.text}")

        return len(ids)

    def search(
        self,
        query_vector: List[float],
        tenant_id: UUID,
        kb_ids: List[UUID],
        top_k: int = 5,
        min_score: float = 0.7
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors with tenant and KB filtering"""
        # Build filter conditions
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=str(tenant_id))
            )
        ]

        # Add KB filter (any of the provided KB IDs)
        if kb_ids:
            kb_str_ids = [str(kb_id) for kb_id in kb_ids]
            must_conditions.append(
                FieldCondition(
                    key="kb_id",
                    match=MatchAny(any=kb_str_ids)
                )
            )

        search_filter = Filter(must=must_conditions)

        # Perform search
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            query_filter=search_filter,
            limit=top_k,
            score_threshold=min_score
        )

        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                "chunk_text": result.payload["chunk_text"],
                "score": result.score,
                "document_id": result.payload["doc_id"],
                "chunk_index": result.payload["chunk_index"],
                "knowledge_base_id": result.payload["kb_id"]
            })

        return formatted_results

    def delete_document_vectors(self, document_id: UUID) -> bool:
        """Delete all vectors associated with a document"""
        try:
            # Delete by filter (all points with this doc_id)
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="doc_id",
                            match=MatchValue(value=str(document_id))
                        )
                    ]
                )
            )
            return True
        except Exception as e:
            print(f"Error deleting vectors for document {document_id}: {e}")
            return False

    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection"""
        try:
            info = self.client.get_collection(collection_name=self.collection_name)
            return {
                "status": "ok",
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
                "config": {
                    "distance": info.config.params.vectors.distance,
                    "size": info.config.params.vectors.size
                }
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
