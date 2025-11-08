from typing import List, Tuple
from langchain.text_splitter import RecursiveCharacterTextSplitter
from openai import OpenAI
from app.config import settings


class EmbeddingsService:
    """Service for text chunking and embedding generation"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )

    def chunk_text(self, text: str) -> List[str]:
        """Split text into chunks"""
        if not text or not text.strip():
            return []

        chunks = self.text_splitter.split_text(text)
        return [chunk.strip() for chunk in chunks if chunk.strip()]

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            response = self.client.embeddings.create(
                model=settings.openai_embedding_model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            raise ValueError(f"Failed to generate embedding: {str(e)}")

    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts in batch"""
        if not texts:
            return []

        try:
            response = self.client.embeddings.create(
                model=settings.openai_embedding_model,
                input=texts
            )
            return [data.embedding for data in response.data]
        except Exception as e:
            raise ValueError(f"Failed to generate batch embeddings: {str(e)}")

    def process_document(self, text: str) -> Tuple[List[str], List[List[float]]]:
        """Process document: chunk text and generate embeddings"""
        # Step 1: Chunk the text
        chunks = self.chunk_text(text)

        if not chunks:
            return [], []

        # Step 2: Generate embeddings for all chunks
        embeddings = self.generate_embeddings_batch(chunks)

        return chunks, embeddings
