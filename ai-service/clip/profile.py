import numpy as np
from sklearn.cluster import KMeans
from typing import Optional


class StyleProfileService:
    def __init__(self, n_clusters: int = 5):
        self.n_clusters = n_clusters

    def build(self, embeddings: list) -> dict:
        if len(embeddings) < 2:
            return {'centroids': embeddings, 'labels': list(range(len(embeddings)))}
        matrix = np.array(embeddings, dtype=np.float32)
        k = min(self.n_clusters, len(embeddings))
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(matrix).tolist()
        centroids = km.cluster_centers_.tolist()
        return {'centroids': centroids, 'labels': labels}

    def mean_embedding(self, embeddings: list) -> Optional[np.ndarray]:
        if not embeddings:
            return None
        matrix = np.array(embeddings, dtype=np.float32)
        mean = matrix.mean(axis=0)
        norm = np.linalg.norm(mean)
        return (mean / norm).astype(np.float32) if norm > 0 else mean
