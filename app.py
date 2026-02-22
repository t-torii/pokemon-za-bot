import json
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from models import db, Participant, Match, Round, MatchResult, User
import swiss

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///tournament.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'tournament-secret-key-2024'

db.init_app(app)


def get_current_user():
    """Get the current logged-in user."""
    if 'user_id' in session:
        return User.query.get(session['user_id'])
    return None


def login_required(f):
    """Decorator to require login for a route."""
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not get_current_user():
            return jsonify({'error': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator to require admin privileges."""
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Login required'}), 401
        if not user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


@app.route('/')
def index():
    """Main page with tab-based interface."""
    # Check if user is logged in
    if not get_current_user():
        return render_template('login.html')
    return render_template('index.html')


@app.route('/api/participants', methods=['GET', 'POST'])
def participants():
    """Handle participant CRUD operations."""
    if request.method == 'GET':
        from models import MatchResult

        participants = Participant.query.all()
        result = []
        for p in participants:
            # Calculate totals from MatchResult for this participant
            stats = db.session.query(
                db.func.coalesce(db.func.sum(MatchResult.win), 0).label('total_win'),
                db.func.coalesce(db.func.sum(MatchResult.loss), 0).label('total_loss'),
                db.func.coalesce(db.func.sum(MatchResult.draw), 0).label('total_draw'),
                db.func.coalesce(db.func.sum(MatchResult.points), 0).label('total_points')
            ).filter(MatchResult.player_id == p.id).first()

            result.append({
                'id': p.id,
                'name': p.name,
                'win_count': stats.total_win,
                'loss_count': stats.total_loss,
                'draw_count': stats.total_draw,
                'points': stats.total_points
            })
        return jsonify(result)

    elif request.method == 'POST':
        # Require login for adding participants
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Login required'}), 401

        data = request.get_json()
        name = data.get('name')

        if not name:
            return jsonify({'error': 'Name is required'}), 400

        participant = Participant(name=name)
        db.session.add(participant)
        db.session.commit()

        return jsonify(participant.to_dict()), 201


@app.route('/api/participants/<int:participant_id>', methods=['DELETE'])
def delete_participant(participant_id):
    """Delete a participant."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    if not user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403

    participant = Participant.query.get(participant_id)
    if not participant:
        return jsonify({'error': 'Participant not found'}), 404

    db.session.delete(participant)
    db.session.commit()

    return jsonify({'message': 'Participant deleted'})


@app.route('/api/matches/next', methods=['POST'])
def generate_next_matches():
    """Generate the next round of Swiss-system matches."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    if not user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403

    matches, round_obj = swiss.generate_next_round_matches()

    match_data = []
    for match in matches:
        match_obj = Match.query.filter_by(
            round_id=round_obj.id,
            table_number=match['table_number']
        ).first()
        match_data.append({
            'id': match_obj.id,
            'table_number': match_obj.table_number,
            'players': [match_obj.player1_id, match_obj.player2_id, match_obj.player3_id, match_obj.player4_id]
        })

    return jsonify({
        'round': round_obj.round_number,
        'matches': match_data
    })


@app.route('/api/matches', methods=['POST'])
def record_match():
    """Record or update match results."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    data = request.get_json()
    match_id = data.get('match_id')
    results = data.get('results', [])

    if not match_id:
        return jsonify({'error': 'Match ID is required'}), 400

    # Check if results already exist (editing vs recording)
    match = Match.query.get(match_id)
    if match and match.result_json is not None:
        # Update existing results
        _, error = swiss.update_match_results(match_id, results)
    else:
        # Record new results
        _, error = swiss.process_match_results(match_id, results)

    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': 'Results recorded',
        'points': {}
    })


@app.route('/api/matches/<int:match_id>', methods=['GET'])
def get_match(match_id):
    """Get a specific match with its results."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    match_data, error = swiss.get_match_with_results(match_id)
    if error:
        return jsonify({'error': error}), 404
    return jsonify(match_data)


@app.route('/api/matches/current', methods=['GET'])
def get_current_matches():
    """Get matches from the current/last round."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    matches, round_obj = swiss.get_active_matches()

    match_data = []
    for match in matches:
        players = []
        if match.player1_id:
            p = Participant.query.get(match.player1_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player2_id:
            p = Participant.query.get(match.player2_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player3_id:
            p = Participant.query.get(match.player3_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player4_id:
            p = Participant.query.get(match.player4_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})

        match_data.append({
            'id': match.id,
            'table_number': match.table_number,
            'players': players,
            'completed': match.result_json is not None
        })

    return jsonify({
        'round': round_obj.round_number if round_obj else None,
        'matches': match_data
    })


@app.route('/api/standings', methods=['GET'])
def get_standings():
    """Get current standings/rankings."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    from models import MatchResult, db

    participants = swiss.get_standings()

    standings = []
    for i, p in enumerate(participants, 1):
        # Calculate totals from MatchResult for this participant
        stats = db.session.query(
            db.func.coalesce(db.func.sum(MatchResult.win), 0).label('total_win'),
            db.func.coalesce(db.func.sum(MatchResult.loss), 0).label('total_loss'),
            db.func.coalesce(db.func.sum(MatchResult.draw), 0).label('total_draw'),
            db.func.coalesce(db.func.sum(MatchResult.points), 0).label('total_points')
        ).filter(MatchResult.player_id == p.id).first()

        standings.append({
            'rank': i,
            'id': p.id,
            'name': p.name,
            'wins': stats.total_win,
            'losses': stats.total_loss,
            'draws': stats.total_draw,
            'points': stats.total_points
        })

    return jsonify(standings)


@app.route('/api/rounds', methods=['GET'])
def get_rounds():
    """Get all rounds."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    rounds = Round.query.order_by(Round.round_number.desc()).all()
    return jsonify([{'id': r.id, 'round_number': r.round_number} for r in rounds])


@app.route('/api/players/<int:participant_id>/matches', methods=['GET'])
def get_player_matches(participant_id):
    """Get all matches for a specific player across all rounds."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    participant = Participant.query.get(participant_id)
    if not participant:
        return jsonify({'error': 'Participant not found'}), 404

    matches = Match.query.filter(
        (Match.player1_id == participant_id) |
        (Match.player2_id == participant_id) |
        (Match.player3_id == participant_id) |
        (Match.player4_id == participant_id)
    ).order_by(Match.round_id.desc(), Match.table_number.asc()).all()

    matches_data = []
    for match in matches:
        round_obj = Round.query.get(match.round_id)

        # プレイヤーがこの試合で何番プレイヤーか
        player_slot = None
        if match.player1_id == participant_id:
            player_slot = 1
        elif match.player2_id == participant_id:
            player_slot = 2
        elif match.player3_id == participant_id:
            player_slot = 3
        elif match.player4_id == participant_id:
            player_slot = 4

        # 相手プレイヤーの取得
        opponents = []
        if match.player1_id and match.player1_id != participant_id:
            p = Participant.query.get(match.player1_id)
            opponents.append(p.name if p else 'TBD')
        if match.player2_id and match.player2_id != participant_id:
            p = Participant.query.get(match.player2_id)
            opponents.append(p.name if p else 'TBD')
        if match.player3_id and match.player3_id != participant_id:
            p = Participant.query.get(match.player3_id)
            opponents.append(p.name if p else 'TBD')
        if match.player4_id and match.player4_id != participant_id:
            p = Participant.query.get(match.player4_id)
            opponents.append(p.name if p else 'TBD')

        # 全プレイヤー情報と自分の結果を取得
        players_info = []
        for attr_name, player_id in [('player1', match.player1_id), ('player2', match.player2_id),
                                      ('player3', match.player3_id), ('player4', match.player4_id)]:
            if player_id:
                p = Participant.query.get(player_id)
                player_info = {'id': player_id, 'name': p.name if p else 'TBD', 'slot': int(attr_name[-1])}

                # 自分の結果を取得
                if player_id == participant_id:
                    result = MatchResult.query.filter_by(match_id=match.id, player_id=player_id).first()
                    if result:
                        player_info['result'] = {
                            'win': result.win,
                            'loss': result.loss,
                            'draw': result.draw,
                            'points': result.points
                        }

                players_info.append(player_info)

        matches_data.append({
            'match_id': match.id,
            'round_id': match.round_id,
            'round_number': round_obj.round_number if round_obj else 0,
            'table_number': match.table_number,
            'player_slot': player_slot,
            'opponents': opponents,
            'completed': match.result_json is not None,
            'players': players_info,
            'result': match.result_json
        })

    # Calculate total stats for this participant from all matches
    stats = db.session.query(
        db.func.coalesce(db.func.sum(MatchResult.win), 0).label('total_win'),
        db.func.coalesce(db.func.sum(MatchResult.loss), 0).label('total_loss'),
        db.func.coalesce(db.func.sum(MatchResult.draw), 0).label('total_draw'),
        db.func.coalesce(db.func.sum(MatchResult.points), 0).label('total_points')
    ).filter(MatchResult.player_id == participant_id).first()

    return jsonify({
        'player_id': participant.id,
        'player_name': participant.name,
        'matches': matches_data,
        'total_stats': {
            'wins': stats.total_win,
            'losses': stats.total_loss,
            'draws': stats.total_draw,
            'points': stats.total_points
        }
    })


@app.route('/api/players/<int:participant_id>/round/<int:round_id>/match', methods=['POST'])
def update_player_match(participant_id, round_id):
    """Update or create match result for a player in a specific round."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    participant = Participant.query.get(participant_id)
    if not participant:
        return jsonify({'error': 'Participant not found'}), 404

    data = request.get_json()
    table_number = data.get('table_number')
    results = data.get('results', [])

    if not table_number:
        return jsonify({'error': 'Table number is required'}), 400

    # 既存の試合を検索
    match = Match.query.filter_by(
        round_id=round_id,
        table_number=table_number
    ).first()

    if not match:
        return jsonify({'error': 'Match not found'}), 404

    if match.result_json is not None:
        # 既存の結果を更新
        _, error = swiss.update_match_results(match.id, results)
    else:
        # 新規に結果を記録
        _, error = swiss.process_match_results(match.id, results)

    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': 'Results recorded',
        'match_id': match.id
    })


@app.route('/api/matches/round/<int:round_id>', methods=['GET'])
def get_round_matches(round_id):
    """Get matches from a specific round."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    round_obj = Round.query.get(round_id)
    if not round_obj:
        return jsonify({'error': 'Round not found'}), 404

    matches = Match.query.filter_by(round_id=round_id).order_by(Match.table_number).all()

    match_data = []
    for match in matches:
        players = []
        if match.player1_id:
            p = Participant.query.get(match.player1_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player2_id:
            p = Participant.query.get(match.player2_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player3_id:
            p = Participant.query.get(match.player3_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})
        if match.player4_id:
            p = Participant.query.get(match.player4_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})

        match_data.append({
            'id': match.id,
            'table_number': match.table_number,
            'players': players,
            'completed': match.result_json is not None
        })

    return jsonify({
        'round': round_obj.round_number,
        'matches': match_data
    })


@app.route('/api/clear', methods=['POST'])
def clear_data():
    """Clear all tournament data (for testing)."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    if not user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403

    MatchResult.query.delete()
    Match.query.delete()
    Round.query.delete()
    Participant.query.delete()
    db.session.commit()
    return jsonify({'message': 'All data cleared'})


with app.app_context():
    db.create_all()

    # Create default users if not exists
    admin_user = User.query.filter_by(username='admin').first()
    guest_user = User.query.filter_by(username='guest').first()

    if admin_user is None:
        # Admin user (full access)
        admin_user = User(username='admin')
        admin_user.set_password('admin123')
        admin_user.is_admin = True
        db.session.add(admin_user)

    if guest_user is None:
        # Guest user (view-only access)
        guest_user = User(username='guest')
        guest_user.set_password('guest123')
        guest_user.is_admin = False
        db.session.add(guest_user)

    # Ensure permissions are set correctly
    if admin_user:
        admin_user.is_admin = True
    if guest_user:
        guest_user.is_admin = False
        # Update password for guest if it was reset
        if not guest_user.password_hash.startswith('pbkdf2:sha256'):
            guest_user.set_password('guest123')

    db.session.commit()


@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page and authentication."""
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            session['user_id'] = user.id
            return jsonify({'message': 'Login successful'})

        return jsonify({'error': 'Invalid credentials'}), 401

    # For GET request, return login page (or info if using SPA)
    return jsonify({
        'authenticated': False,
        'message': 'Use POST to login'
    })


@app.route('/logout', methods=['POST'])
def logout():
    """Logout user."""
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out'})


@app.route('/api/me', methods=['GET'])
def get_current_user_info():
    """Get current user info."""
    user = get_current_user()
    if user:
        return jsonify(user.to_dict())
    return jsonify({'error': 'Not authenticated'}), 401


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
