from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, ForeignKey, JSON, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./vos.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class DbDocument(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    repo_path = Column(String, nullable=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reviews = relationship("DbReview", back_populates="document", cascade="all, delete-orphan")


class DbReview(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    persona_ids = Column(JSON, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    document = relationship("DbDocument", back_populates="reviews")
    comments = relationship("DbComment", back_populates="review", cascade="all, delete-orphan")
    meta_comments = relationship("DbMetaComment", back_populates="review", cascade="all, delete-orphan")


class DbComment(Base):
    __tablename__ = "comments"

    id = Column(String, primary_key=True)
    review_id = Column(String, ForeignKey("reviews.id"), nullable=False)
    document_id = Column(String, nullable=False)
    persona_id = Column(String, nullable=False)
    persona_name = Column(String, nullable=False)
    persona_color = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    start_line = Column(Integer, nullable=False)
    end_line = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    review = relationship("DbReview", back_populates="comments")


class DbMetaComment(Base):
    __tablename__ = "meta_comments"

    id = Column(String, primary_key=True)
    review_id = Column(String, ForeignKey("reviews.id"), nullable=False)
    content = Column(Text, nullable=False)
    start_line = Column(Integer, nullable=False)
    end_line = Column(Integer, nullable=False)
    sources = Column(JSON, nullable=False)  # [{persona_id, persona_name, persona_color, original_content}]
    category = Column(String, nullable=False)  # structure, clarity, technical, security, accessibility
    priority = Column(String, nullable=False)  # critical, high, medium, low
    created_at = Column(DateTime, default=datetime.utcnow)

    review = relationship("DbReview", back_populates="meta_comments")


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
