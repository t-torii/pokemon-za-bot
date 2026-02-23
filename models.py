from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_approved = db.Column(db.Boolean, default=False)  # Admin approval required for login
    participant_id = db.Column(db.Integer, db.ForeignKey('participants.id'), nullable=True)

    # Password reset fields
    reset_password = db.Column(db.String(6), nullable=True)
    reset_password_expires = db.Column(db.DateTime, nullable=True)

    def set_password(self, password):
        # scryptはmacOSのPython 3.9で利用できない場合があるため、pbkdf2:sha256を使用
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'is_admin': self.is_admin,
            'is_approved': self.is_approved,
            'participant_id': self.participant_id
        }

    def generate_reset_password(self):
        """Generate a random 6-character reset password."""
        import random
        import string
        characters = string.ascii_letters + string.digits
        self.reset_password = ''.join(random.choices(characters, k=6))
        self.reset_password_expires = datetime.datetime.now() + datetime.timedelta(hours=24)
        return self.reset_password


class Participant(db.Model):
    __tablename__ = 'participants'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    win_count = db.Column(db.Integer, default=0)
    loss_count = db.Column(db.Integer, default=0)
    draw_count = db.Column(db.Integer, default=0)
    points = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'win_count': self.win_count,
            'loss_count': self.loss_count,
            'draw_count': self.draw_count,
            'points': self.points
        }


class Round(db.Model):
    __tablename__ = 'rounds'

    id = db.Column(db.Integer, primary_key=True)
    round_number = db.Column(db.Integer, unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())


class Match(db.Model):
    __tablename__ = 'matches'

    id = db.Column(db.Integer, primary_key=True)
    round_id = db.Column(db.Integer, db.ForeignKey('rounds.id'), nullable=False)
    table_number = db.Column(db.Integer, nullable=False)
    player1_id = db.Column(db.Integer, db.ForeignKey('participants.id'))
    player2_id = db.Column(db.Integer, db.ForeignKey('participants.id'))
    player3_id = db.Column(db.Integer, db.ForeignKey('participants.id'))
    player4_id = db.Column(db.Integer, db.ForeignKey('participants.id'))
    result_json = db.Column(db.Text)

    round = db.relationship('Round', backref=db.backref('matches', lazy=True))
    player1 = db.relationship('Participant', foreign_keys=[player1_id])
    player2 = db.relationship('Participant', foreign_keys=[player2_id])
    player3 = db.relationship('Participant', foreign_keys=[player3_id])
    player4 = db.relationship('Participant', foreign_keys=[player4_id])


class MatchResult(db.Model):
    __tablename__ = 'match_results'

    id = db.Column(db.Integer, primary_key=True)
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id'), nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey('participants.id'), nullable=False)
    win = db.Column(db.Integer, default=0)
    loss = db.Column(db.Integer, default=0)
    draw = db.Column(db.Integer, default=0)
    points = db.Column(db.Integer, default=0)

    match = db.relationship('Match', backref=db.backref('results', lazy=True))
    player = db.relationship('Participant', foreign_keys=[player_id])
