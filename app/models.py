from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

from .database import Base

# --- Modelli SQLAlchemy (Tabelle del Database) ---

# Tabella di associazione per la relazione Many-to-Many tra Risorse e Skills
# Contiene anche il livello della competenza.
class ResourceSkillLink(Base):
    __tablename__ = 'resource_skill_link'
    resource_id: Mapped[int] = mapped_column(ForeignKey('resources.id'), primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey('skills.id'), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    # Ora 'labels' può contenere più label separate da virgole
    labels: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relazioni per accedere agli oggetti Resource e Skill direttamente dal link
    skill: Mapped["Skill"] = relationship(back_populates="resource_links")

    @property
    def labels_list(self) -> List[str]:
        """Converte la stringa labels in una lista"""
        if not self.labels:
            return []
        return [label.strip() for label in self.labels.split(',') if label.strip()]

    def set_labels_from_list(self, labels_list: List[str]):
        """Imposta le labels da una lista di stringhe"""
        if labels_list:
            self.labels = ','.join([label.strip() for label in labels_list if label.strip()])
        else:
            self.labels = None # Usa None invece di stringa vuota per i campi nullable

    def add_label(self, label: str):
        """Aggiunge una label se non esiste già"""
        label = label.strip()
        if not label:
            return

        current_labels = self.labels_list
        if label not in current_labels:
            current_labels.append(label)
            self.set_labels_from_list(current_labels)

    def remove_label(self, label: str):
        """Rimuove una label se esiste"""
        label = label.strip()
        current_labels = self.labels_list
        if label in current_labels:
            current_labels.remove(label)
            self.set_labels_from_list(current_labels)

    def has_label(self, label: str) -> bool:
        """Verifica se una label esiste"""
        return label.strip() in self.labels_list


class Resource(Base):
    __tablename__ = "resources"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    cognome: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    numero: Mapped[Optional[str]] = mapped_column(String(50))

    business_unit_id: Mapped[int] = mapped_column(ForeignKey('business_units.id'))
    business_unit: Mapped["BusinessUnit"] = relationship(back_populates="resources")

    # La relazione 'skills' non è più necessaria qui, usiamo 'skill_links'
    skill_links: Mapped[List["ResourceSkillLink"]] = relationship(cascade="all, delete-orphan")

class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    resource_links: Mapped[List["ResourceSkillLink"]] = relationship(back_populates="skill", cascade="all, delete-orphan")

    labels: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    @property
    def labels_list(self) -> List[str]:
        """Converte la stringa labels in una lista"""
        if not self.labels:
            return []
        return [label.strip() for label in self.labels.split(',') if label.strip()]

    def set_labels_from_list(self, labels_list: List[str]):
        """Imposta le labels da una lista di stringhe"""
        if labels_list:
            self.labels = ','.join([label.strip() for label in labels_list if label.strip()])
        else:
            self.labels = None # Usa None invece di stringa vuota per i campi nullable

    def add_label(self, label: str):
        """Aggiunge una label se non esiste già"""
        label = label.strip()
        if not label:
            return

        current_labels = self.labels_list
        if label not in current_labels:
            current_labels.append(label)
            self.set_labels_from_list(current_labels)

    def remove_label(self, label: str):
        """Rimuove una label se esiste"""
        label = label.strip()
        current_labels = self.labels_list
        if label in current_labels:
            current_labels.remove(label)
            self.set_labels_from_list(current_labels)

    def has_label(self, label: str) -> bool:
        """Verifica se una label esiste"""
        return label.strip() in self.labels_list

class BusinessUnit(Base):
    __tablename__ = "business_units"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    resources: Mapped[List["Resource"]] = relationship(back_populates="business_unit")


# --- Modelli Pydantic (Validazione Dati API) ---

# Configurazione comune per i modelli Pydantic
orm_config = ConfigDict(from_attributes=True)

# Skill
class SkillBase(BaseModel):
    name: str

class SkillCreate(SkillBase):
    labels: Optional[List[str]] = []
    pass

class SkillSchema(SkillBase):
    id: int
    labels: List[str]

    model_config = orm_config

    @classmethod
    def from_orm(cls, skill: Skill):
        return cls(
            id=skill.id,
            name=skill.name,
            labels=skill.labels_list  # converte la stringa in lista
        )


class SkillLabelAdd(BaseModel):
    label: str

class SkillLabelRemove(BaseModel):
    label: str

class SkillLabelsUpdate(BaseModel):
    labels: List[str]

# Business Unit
class BusinessUnitBase(BaseModel):
    name: str

class BusinessUnitCreate(BusinessUnitBase):
    pass

class BusinessUnitSchema(BusinessUnitBase):
    id: int
    model_config = orm_config

class BuDeleteOptions(BaseModel):
    action: str # 'migrate' o 'delete'
    target_bu_id: Optional[int] = None

# Resource
class ResourceSkillSchema(BaseModel):
    skill_id: int
    level: int
    name: str # Nome della skill per comodità nel frontend
    labels: Optional[List[str]] = None # Ora una lista di label
    model_config = orm_config

class ResourceBase(BaseModel):
    nome: str
    cognome: str
    email: str
    numero: Optional[str] = None
    business_unit_id: int

class ResourceCreate(ResourceBase):
    pass

# Schema per la risposta, per mostrare i dati in modo più leggibile
class ResourceSchema(BaseModel):
    id: int
    nome: str
    cognome: str
    email: str
    numero: Optional[str] = None
    business_unit: BusinessUnitSchema
    skills: List[ResourceSkillSchema]
    model_config = orm_config

class ResourceSkillUpdate(BaseModel):
    skill_id: int
    level: int
    labels: Optional[List[str]] = None # Ora una lista di label in input