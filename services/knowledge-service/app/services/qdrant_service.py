from typing import List, Dict, Any
from uuid import UUID
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
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
        if len(chunks) != len(embeddings):
            raise ValueError("Number of chunks must match number of embeddings")

        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point = PointStruct(
                id=f"{document_id}_{i}",
                vector=embedding,
                payload={
                    "tenant_id": str(tenant_id),
                    "kb_id": str(kb_id),
                    "doc_id": str(document_id),
                    "chunk_text": chunk,
                    "chunk_index": i
                }
            )
            points.append(point)

        # Upsert points in batches of 100
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            self.client.upsert(
                collection_name=self.collection_name,
                points=batch
            )

        return len(points)

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
                    match=MatchValue(any=kb_str_ids)
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
