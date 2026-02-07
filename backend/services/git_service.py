import os
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Tuple
from git import Repo, GitCommandError
from core.config import get_settings

class GitService:
    """Git operations for document versioning"""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_path = Path(self.settings.repos_base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def create_repo(self, name: str) -> Tuple[str, Path]:
        """Create a new git repo for a document"""
        repo_id = str(uuid.uuid4())[:8]
        repo_path = self.base_path / f"{name}_{repo_id}"
        repo_path.mkdir(parents=True, exist_ok=True)
        
        repo = Repo.init(repo_path)
        
        # Configure git user for this repo
        repo.config_writer().set_value("user", "name", "VOS System").release()
        repo.config_writer().set_value("user", "email", "vos@local").release()
        
        return repo_id, repo_path
    
    def get_repo(self, repo_path: str) -> Repo:
        """Get an existing repo"""
        return Repo(repo_path)
    
    def commit_file(
        self, 
        repo_path: str, 
        file_name: str, 
        content: str, 
        message: str,
        author: str = "VOS User"
    ) -> str:
        """Write content to file and commit"""
        repo = self.get_repo(repo_path)
        file_path = Path(repo_path) / file_name
        
        file_path.write_text(content)
        repo.index.add([file_name])
        
        commit = repo.index.commit(
            message,
            # author is read from git config
        )
        
        return commit.hexsha
    
    def get_file_content(self, repo_path: str, file_name: str, commit_hash: Optional[str] = None) -> str:
        """Get file content at specific version or HEAD"""
        repo = self.get_repo(repo_path)
        
        if commit_hash:
            commit = repo.commit(commit_hash)
            blob = commit.tree / file_name
            return blob.data_stream.read().decode('utf-8')
        else:
            file_path = Path(repo_path) / file_name
            return file_path.read_text()
    
    def get_history(self, repo_path: str, file_name: Optional[str] = None, limit: int = 50) -> List[dict]:
        """Get commit history"""
        repo = self.get_repo(repo_path)
        commits = []
        
        for commit in repo.iter_commits(max_count=limit):
            commits.append({
                "hash": commit.hexsha,
                "short_hash": commit.hexsha[:7],
                "message": commit.message.strip(),
                "author": str(commit.author),
                "timestamp": datetime.fromtimestamp(commit.committed_date),
            })
        
        return commits
    
    def get_diff(
        self, 
        repo_path: str, 
        from_hash: str, 
        to_hash: Optional[str] = None,
        file_name: Optional[str] = None
    ) -> str:
        """Get diff between two commits"""
        repo = self.get_repo(repo_path)
        
        from_commit = repo.commit(from_hash)
        to_commit = repo.commit(to_hash) if to_hash else repo.head.commit
        
        if file_name:
            diff = from_commit.diff(to_commit, paths=[file_name], create_patch=True)
        else:
            diff = from_commit.diff(to_commit, create_patch=True)
        
        return "\n".join(d.diff.decode('utf-8') for d in diff)
    
    def create_branch(self, repo_path: str, branch_name: str) -> str:
        """Create a new branch"""
        repo = self.get_repo(repo_path)
        new_branch = repo.create_head(branch_name)
        return new_branch.name
    
    def switch_branch(self, repo_path: str, branch_name: str) -> str:
        """Switch to a branch"""
        repo = self.get_repo(repo_path)
        repo.heads[branch_name].checkout()
        return branch_name
    
    def list_branches(self, repo_path: str) -> List[dict]:
        """List all branches"""
        repo = self.get_repo(repo_path)
        return [
            {
                "name": branch.name,
                "is_current": branch == repo.active_branch,
                "commit": branch.commit.hexsha[:7],
            }
            for branch in repo.branches
        ]
