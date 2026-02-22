import json
from flask import Flask, request, jsonify, render_template
from models import db, Participant, Match, Round, MatchResult
import swiss

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///tournament.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)


@app.route('/')
def index():
    """Main page with tab-based interface."""
    return render_template('index.html')


@app.route('/api/participants', methods=['GET', 'POST'])
def participants():
    """Handle participant CRUD operations."""
    if request.method == 'GET':
        participants = Participant.query.all()
        return jsonify([p.to_dict() for p in participants])

    elif request.method == 'POST':
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
    participant = Participant.query.get(participant_id)
    if not participant:
        return jsonify({'error': 'Participant not found'}), 404

    db.session.delete(participant)
    db.session.commit()

    return jsonify({'message': 'Participant deleted'})


@app.route('/api/matches/next', methods=['GET'])
def get_next_matches():
    """Get the next round of Swiss-system matches."""
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
            'players': match_obj.player1_id,
            'player2_id': match_obj.player2_id,
            'player3_id': match_obj.player3_id,
            'player4_id': match_obj.player4_id
        })

    return jsonify({
        'round': round_obj.round_number,
        'matches': match_data
    })


@app.route('/api/matches', methods=['POST'])
def record_match():
    """Record or update match results."""
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
    match_data, error = swiss.get_match_with_results(match_id)
    if error:
        return jsonify({'error': error}), 404
    return jsonify(match_data)


@app.route('/api/matches/current', methods=['GET'])
def get_current_matches():
    """Get matches from the current/last round."""
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
    participants = swiss.get_standings()

    standings = []
    for i, p in enumerate(participants, 1):
        standings.append({
            'rank': i,
            'id': p.id,
            'name': p.name,
            'wins': p.win_count,
            'losses': p.loss_count,
            'draws': p.draw_count,
            'points': p.points
        })

    return jsonify(standings)


@app.route('/api/rounds', methods=['GET'])
def get_rounds():
    """Get all rounds."""
    rounds = Round.query.order_by(Round.round_number.desc()).all()
    return jsonify([{'id': r.id, 'round_number': r.round_number} for r in rounds])


@app.route('/api/matches/round/<int:round_id>', methods=['GET'])
def get_round_matches(round_id):
    """Get matches from a specific round."""
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
    MatchResult.query.delete()
    Match.query.delete()
    Round.query.delete()
    Participant.query.delete()
    db.session.commit()
    return jsonify({'message': 'All data cleared'})


with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
