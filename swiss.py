"""Swiss-system pairing algorithm for Pokemon TCG tournaments."""

from collections import defaultdict
from itertools import combinations
from models import Participant, Match, Round, MatchResult, db


def get_standings():
    """Get participants sorted by points (descending)."""
    participants = Participant.query.order_by(
        Participant.points.desc(),
        Participant.win_count.desc()
    ).all()
    return participants


def create_round(round_number):
    """Create a new round if it doesn't exist."""
    existing_round = Round.query.filter_by(round_number=round_number).first()
    if existing_round:
        return existing_round

    new_round = Round(round_number=round_number)
    db.session.add(new_round)
    db.session.commit()
    return new_round


def get_past_opponents(player_id, round_number):
    """Get list of opponent player IDs this player has faced before current round."""
    from models import Match, MatchResult

    opponents = set()

    # Get all matches from previous rounds where this player participated
    previous_matches = db.session.query(Match).join(Round).filter(
        Round.round_number < round_number
    ).filter(
        db.or_(
            Match.player1_id == player_id,
            Match.player2_id == player_id,
            Match.player3_id == player_id,
            Match.player4_id == player_id
        )
    ).all()

    for match in previous_matches:
        for pid in [match.player1_id, match.player2_id, match.player3_id, match.player4_id]:
            if pid and pid != player_id:
                opponents.add(pid)

    return opponents


def generate_swiss_matches(round_number):
    """Generate match pairings using Swiss-system algorithm.

    Players are paired based on their points. Players with same points
    are paired together. Each match has up to 4 players (table).
    Multiple tables are created if there are more than 4 players.

    This implementation tries to avoid rematching players who have
    already faced each other in previous rounds.
    """
    participants = get_standings()

    participants_with_points = []
    for p in participants:
        participants_with_points.append({
            'participant': p,
            'points': p.points
        })

    # Sort by points (desc)
    participants_with_points.sort(key=lambda x: -x['points'])

    # Track which players have been paired
    paired = set()
    matches = []
    table_number = 1

    # Group players by points
    by_points = defaultdict(list)
    for p in participants_with_points:
        by_points[p['points']].append(p['participant'].id)

    # Process each point group
    for points in sorted(by_points.keys(), reverse=True):
        player_ids = by_points[points]

        unpaired_in_group = set(player_ids)

        while len(unpaired_in_group) >= 4:
            # Try to find 4 players who haven't played each other
            best_group = None
            min_past_matches = float('inf')

            # Get all combinations of 4 from unpaired players
            for combo in combinations(unpaired_in_group, 4):
                # Count how many past matches exist within this group
                past_count = 0
                for p1, p2 in combinations(combo, 2):
                    if p2 in get_past_opponents(p1, round_number):
                        past_count += 1

                if past_count < min_past_matches:
                    min_past_matches = past_count
                    best_group = combo

            if best_group:
                matches.append({
                    'table_number': table_number,
                    'player_ids': list(best_group)
                })
                for pid in best_group:
                    unpaired_in_group.discard(pid)
                    paired.add(pid)
                table_number += 1
            else:
                # If no clean combination, just take first 4
                group = list(unpaired_in_group)[:4]
                matches.append({
                    'table_number': table_number,
                    'player_ids': group
                })
                for pid in group:
                    unpaired_in_group.discard(pid)
                    paired.add(pid)
                table_number += 1

        # Handle remaining players (3, 2, or 1)
        remaining = list(unpaired_in_group)
        if len(remaining) >= 3:
            matches.append({
                'table_number': table_number,
                'player_ids': remaining
            })
            for pid in remaining:
                paired.add(pid)
            table_number += 1
            unpaired_in_group = set()
        elif len(remaining) >= 2:
            matches.append({
                'table_number': table_number,
                'player_ids': remaining
            })
            for pid in remaining:
                paired.add(pid)
            table_number += 1
            unpaired_in_group = set()
        elif len(remaining) == 1:
            # Single player - will be handled below
            pass

    # Handle any unpaired players from all groups by mixing point groups
    unpaired_all = [p['participant'].id for p in participants_with_points
                    if p['participant'].id not in paired]

    while len(unpaired_all) >= 4:
        group = unpaired_all[:4]
        matches.append({
            'table_number': table_number,
            'player_ids': group
        })
        for pid in group:
            paired.add(pid)
        unpaired_all = unpaired_all[4:]
        table_number += 1

    if len(unpaired_all) >= 2:
        matches.append({
            'table_number': table_number,
            'player_ids': unpaired_all
        })
        for pid in unpaired_all:
            paired.add(pid)
        table_number += 1
    elif len(unpaired_all) == 1:
        # Add to last match if possible
        if matches:
            matches[-1]['player_ids'].append(unpaired_all[0])
        else:
            matches.append({
                'table_number': table_number,
                'player_ids': unpaired_all
            })

    return matches


def save_matches_to_db(matches, round_id):
    """Save generated matches to the database."""
    for match_data in matches:
        player_ids = match_data['player_ids']

        match = Match(
            round_id=round_id,
            table_number=match_data['table_number'],
            player1_id=player_ids[0] if len(player_ids) > 0 else None,
            player2_id=player_ids[1] if len(player_ids) > 1 else None,
            player3_id=player_ids[2] if len(player_ids) > 2 else None,
            player4_id=player_ids[3] if len(player_ids) > 3 else None
        )
        db.session.add(match)

    db.session.commit()


def generate_next_round_matches():
    """Generate and save matches for the next round."""
    # Get the current round number
    current_round = Round.query.order_by(Round.round_number.desc()).first()
    next_round_number = 1 if not current_round else current_round.round_number + 1

    # Create round and generate matches
    round_obj = create_round(next_round_number)
    matches = generate_swiss_matches(next_round_number)
    save_matches_to_db(matches, round_obj.id)

    return matches, round_obj


def get_matches_by_round(round_id):
    """Get all matches from a specific round."""
    matches = Match.query.filter_by(round_id=round_id).order_by(Match.table_number).all()
    return matches, None


def get_match_with_results(match_id):
    """Get a match with its results and player details."""
    match = Match.query.get(match_id)
    if not match:
        return None, "Match not found"

    players = []
    result_data = []

    for attr_name, player_id in [('player1', match.player1_id), ('player2', match.player2_id),
                                  ('player3', match.player3_id), ('player4', match.player4_id)]:
        if player_id:
            p = Participant.query.get(player_id)
            players.append({'id': p.id, 'name': p.name} if p else {'id': None, 'name': 'TBD'})

            # Get match result for this player
            result = MatchResult.query.filter_by(match_id=match_id, player_id=player_id).first()
            if result:
                result_data.append({
                    'player_id': player_id,
                    'win': result.win,
                    'loss': result.loss,
                    'draw': result.draw,
                    'points': result.points
                })

    return {
        'id': match.id,
        'round_id': match.round_id,
        'table_number': match.table_number,
        'players': players,
        'completed': match.result_json is not None,
        'results': result_data
    }, None


def process_match_results(match_id, results):
    """Process new match results (for first-time recording)."""
    match = Match.query.get(match_id)
    if not match:
        return None, "Match not found"

    # Get all player IDs involved in this match
    player_ids = [match.player1_id, match.player2_id, match.player3_id, match.player4_id]
    player_ids = [p for p in player_ids if p is not None]

    # Update participant stats
    for player_id in player_ids:
        participant = Participant.query.get(player_id)
        if participant:
            # Find results for this player
            player_result = next((r for r in results if r['player_id'] == player_id), None)
            if player_result:
                # Set initial stats (not incrementing, since this is the first recording)
                participant.win_count = player_result.get('win', 0)
                participant.loss_count = player_result.get('loss', 0)
                participant.draw_count = player_result.get('draw', 0)
                participant.points = player_result.get('points', 0)

                db.session.add(participant)

                # Save match result
                match_result = MatchResult(
                    match_id=match_id,
                    player_id=player_id,
                    win=player_result.get('win', 0),
                    loss=player_result.get('loss', 0),
                    draw=player_result.get('draw', 0),
                    points=player_result.get('points', 0)
                )
                db.session.add(match_result)

    # Mark match as completed
    match.result_json = str(results)
    db.session.commit()

    return {}, None


def update_match_results(match_id, results):
    """Update match results (for editing)."""
    match = Match.query.get(match_id)
    if not match:
        return None, "Match not found"

    # Delete existing results
    MatchResult.query.filter_by(match_id=match_id).delete()

    # Get all player IDs involved in this match
    player_ids = [match.player1_id, match.player2_id, match.player3_id, match.player4_id]
    player_ids = [p for p in player_ids if p is not None]

    # Update participant stats
    for player_id in player_ids:
        participant = Participant.query.get(player_id)
        if participant:
            # Find results for this player
            player_result = next((r for r in results if r['player_id'] == player_id), None)
            if player_result:
                # Update stats with the new values (not incrementing)
                participant.win_count = player_result.get('win', 0)
                participant.loss_count = player_result.get('loss', 0)
                participant.draw_count = player_result.get('draw', 0)
                participant.points = player_result.get('points', 0)

                db.session.add(participant)

                # Save match result
                match_result = MatchResult(
                    match_id=match_id,
                    player_id=player_id,
                    win=player_result.get('win', 0),
                    loss=player_result.get('loss', 0),
                    draw=player_result.get('draw', 0),
                    points=player_result.get('points', 0)
                )
                db.session.add(match_result)

    # Mark match as completed
    match.result_json = str(results)
    db.session.commit()

    return {}, None
