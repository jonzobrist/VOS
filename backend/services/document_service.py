import uuid
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from models.document import Document, DocumentCreate, DocumentVersion
from services.git_service import GitService

class DocumentService:
    """Document management with git-backed versioning"""
    _instance = None
    _documents: dict = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.git = GitService()
        return cls._instance
    
    def create(self, doc: DocumentCreate) -> Document:
        """Create a new document"""
        repo_id, repo_path = self.git.create_repo(doc.title.lower().replace(" ", "-"))
        
        file_name = "document.md"
        commit_hash = self.git.commit_file(
            str(repo_path),
            file_name,
            doc.content,
            f"Initial version: {doc.title}"
        )
        
        now = datetime.utcnow()
        document = Document(
            id=repo_id,
            title=doc.title,
            description=doc.description,
            repo_path=str(repo_path),
            current_branch="main",
            created_at=now,
            updated_at=now,
            versions=[DocumentVersion(
                commit_hash=commit_hash,
                message=f"Initial version: {doc.title}",
                author="VOS System",
                timestamp=now
            )]
        )
        
        self._documents[repo_id] = document
        return document
    
    def get(self, doc_id: str) -> Optional[Document]:
        """Get a document by ID"""
        doc = self._documents.get(doc_id)
        if doc:
            history = self.git.get_history(doc.repo_path)
            doc.versions = [
                DocumentVersion(
                    commit_hash=h["hash"],
                    message=h["message"],
                    author=h["author"],
                    timestamp=h["timestamp"]
                )
                for h in history
            ]
        return doc
    
    def list(self) -> List[Document]:
        """List all documents"""
        return list(self._documents.values())
    
    def get_content(self, doc_id: str, version: Optional[str] = None) -> str:
        """Get document content at specific version"""
        doc = self.get(doc_id)
        if not doc:
            raise ValueError(f"Document {doc_id} not found")
        
        return self.git.get_file_content(doc.repo_path, "document.md", version)
    
    def update(self, doc_id: str, content: str, message: str) -> Document:
        """Update document content (creates new version)"""
        doc = self.get(doc_id)
        if not doc:
            raise ValueError(f"Document {doc_id} not found")
        
        self.git.commit_file(doc.repo_path, "document.md", content, message)
        doc.updated_at = datetime.utcnow()
        return self.get(doc_id)
    
    def get_diff(self, doc_id: str, from_version: str, to_version: Optional[str] = None) -> str:
        """Get diff between versions"""
        doc = self.get(doc_id)
        if not doc:
            raise ValueError(f"Document {doc_id} not found")
        
        return self.git.get_diff(doc.repo_path, from_version, to_version, "document.md")
