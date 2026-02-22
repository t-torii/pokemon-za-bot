/* Pokemon Za トーナメントマネージャー - メインJavaScript */

// 現在のユーザー
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 現在のユーザーをチェック
    await checkUserSession();

    // タブナビゲーション
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // アクティブなタブボタンを更新
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 対応するタブコンテンツを表示
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabName) {
                    content.classList.add('active');
                }
            });

            // 順位タブに切り替えたときにデータを更新
            if (tabName === 'standings') {
                refreshStandings();
            } else if (tabName === 'matches') {
                refreshMatches();
            } else if (tabName === 'participants') {
                loadParticipantList();
            }
        });
    });

    // 参加者管理
    const addParticipantForm = document.getElementById('add-participant-form');
    addParticipantForm.addEventListener('submit', handleAddParticipant);

    // 試合生成ボタン
    document.getElementById('generate-matches-btn').addEventListener('click', generateMatches);

    // ラウンドリストのクリックイベント
    document.getElementById('round-list').addEventListener('click', handleRoundClick);

    // 参加者リストのクリックイベント
    document.getElementById('participant-list').addEventListener('click', handleParticipantClick);

    // 参加者試合結果関連
    document.getElementById('player-results-back-btn').addEventListener('click', hidePlayerMatchResults);
    document.getElementById('player-cancel-btn').addEventListener('click', hidePlayerMatchForm);
    document.getElementById('player-submit-btn').addEventListener('click', submitPlayerMatchResult);
    // 行のクリックで結果セクションを隠す（キャンセルと同等）
    document.getElementById('player-match-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('player-match-card')) {
            hidePlayerMatchForm();
        }
    });

    // ラウンド選択時に参加者の結果も再表示
    document.getElementById('round-list').addEventListener('click', () => {
        if (currentPlayerId) {
            showPlayerMatchResults(currentPlayerId);
        }
    });

    // 結果提出ボタン
    document.getElementById('submit-results-btn').addEventListener('click', submitMatchResults);

    // キャンセルボタン
    document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);

    // データクリアボタン
    document.getElementById('clear-data-btn').addEventListener('click', clearAllData);

    // 順位更新ボタン
    document.getElementById('refresh-standings-btn').addEventListener('click', refreshStandings);

    // 初期データ読み込み
    loadParticipants();
    refreshStandings();
    loadRoundSelect();

    // ログアウトボタン
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // ユーザー名を表示
    if (currentUser) {
        const userName = document.getElementById('user-name');
        if (userName) {
            userName.textContent = currentUser.username;
        }
    }
});

// セッションチェック
async function checkUserSession() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            currentUser = await response.json();
            // セッションが有効な場合はログイン画面の要素を非表示
            const loginContainer = document.querySelector('.login-container');
            if (loginContainer) {
                // ログイン済みの場合はここには来ないけど念のため
                return;
            }
        } else {
            // ログインページにリダイレクト（ログイン画面以外）
            if (!document.querySelector('.login-container')) {
                window.location.href = '/';
            }
        }
    } catch (error) {
        console.error('セッションチェックエラー:', error);
    }
}

// ログアウト
async function handleLogout() {
    try {
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok) {
            // ログアウト後、ログイン画面にリダイレクト
            window.location.href = '/';
        }
    } catch (error) {
        console.error('ログアウトエラー:', error);
        alert('ログアウト中にエラーが発生しました');
    }
}

async function handleAddParticipant(e) {
    e.preventDefault();
    const nameInput = document.getElementById('participant-name');
    const name = nameInput.value.trim();

    if (!name) return;

    try {
        const response = await fetch('/api/participants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            nameInput.value = '';
            loadParticipants();
            refreshStandings();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '参加者の追加に失敗しました'));
        }
    } catch (error) {
        console.error('参加者の追加エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function deleteParticipant(id) {
    if (!confirm('この参加者を削除しますか？')) return;

    try {
        const response = await fetch(`/api/participants/${id}`, { method: 'DELETE' });

        if (response.ok) {
            loadParticipants();
            refreshStandings();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '参加者の削除に失敗しました'));
        }
    } catch (error) {
        console.error('参加者の削除エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function loadParticipants() {
    try {
        const response = await fetch('/api/participants');
        const participants = await response.json();

        const tbody = document.getElementById('participants-body');
        tbody.innerHTML = participants.map(p => `
            <tr class="participant-row" data-participant-id="${p.id}">
                <td>${escapeHtml(p.name)}</td>
                <td>${p.win_count}</td>
                <td>${p.loss_count}</td>
                <td>${p.draw_count}</td>
                <td>${p.points}</td>
                <td>
                    <div class="player-actions">
                        <button class="btn-result" onclick="showPlayerMatchResults(${p.id})">結果登録</button>
                        <button class="btn-delete" onclick="deleteParticipant(${p.id})">削除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('参加者読み込みエラー:', error);
    }
}

async function generateMatches() {
    try {
        const response = await fetch('/api/matches/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            if (response.status === 401) {
                alert('ログインが必要です');
                window.location.href = '/';
                return;
            }
            const error = await response.json();
            alert('エラー: ' + (error.error || '試合の生成に失敗しました'));
            return;
        }

        const data = await response.json();

        alert(`第${data.round}ラウンドの試合が生成されました！`);
        await loadRoundSelect();
        // 新しいラウンドを選択状態に
        setTimeout(() => {
            selectFirstRound();
        }, 100);
    } catch (error) {
        console.error('試合生成エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function viewRoundMatches(roundId) {
    try {
        const response = await fetch(`/api/matches/round/${roundId}`);
        const data = await response.json();

        const container = document.getElementById('matches-container');

        if (data.matches.length === 0) {
            container.innerHTML = '<p class="no-matches">このラウンドには試合がありません。</p>';
            return;
        }

        // テーブル形式で表示（横スクロール対応）
        let tableHtml = `
            <div class="match-container-wrapper">
                <table class="match-table">
                    <thead>
                        <tr>
                            <th>テーブル</th>
                            <th>プレイヤー1</th>
                            <th>プレイヤー2</th>
                            <th>プレイヤー3</th>
                            <th>プレイヤー4</th>
                            <th>結果</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.matches.forEach(match => {
            const resultHtml = match.completed
                ? `
                    <button class="btn-edit" onclick="editMatchResults(${match.id})">結果修正</button>
                    <button class="btn-secondary" onclick="showMatchHistory(${match.id})">結果履歴</button>
                  `
                : `<button class="btn-secondary" onclick="showMatchResults(${match.id})">結果を記録</button>`;

            const players = match.players;
            tableHtml += `
                <tr>
                    <td>テーブル ${match.table_number}</td>
                    <td>${escapeHtml(players[0]?.name || 'BYE')}</td>
                    <td>${escapeHtml(players[1]?.name || 'BYE')}</td>
                    <td>${escapeHtml(players[2]?.name || 'BYE')}</td>
                    <td>${escapeHtml(players[3]?.name || 'BYE')}</td>
                    <td>${resultHtml}</td>
                </tr>
            `;
        });

        tableHtml += '</tbody></table></div>';
        container.innerHTML = tableHtml;
    } catch (error) {
        console.error('試合読み込みエラー:', error);
    }
}

async function showMatchHistory(matchId) {
    try {
        const response = await fetch(`/api/matches/${matchId}`);
        const match = await response.json();

        const form = document.getElementById('match-results-form');
        const container = document.getElementById('match-results-container');

        // 結果履歴を表示
        container.innerHTML = `
            <div class="match-result-entry">
                <h3>結果履歴</h3>
                <div class="match-history">
                    ${match.players.map((p, i) => {
                        const result = match.results.find(r => r.player_id === p.id);
                        return `
                            <div class="history-row">
                                <span class="history-player">${escapeHtml(p.name)}</span>
                                <div class="history-data">
                                    ${result ? `
                                        勝: ${result.win} / 負: ${result.loss} / 引: ${result.draw} / ポイント: ${result.points}
                                    ` : '未記録'}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="margin-top: 15px;">
                    <button class="btn-secondary" onclick="editMatchResults(${matchId})">結果を修正</button>
                    <button class="btn-danger" onclick="cancelEdit()">閉じる</button>
                </div>
            </div>
        `;

        document.getElementById('match-form-title').textContent = '結果履歴';
        form.classList.remove('hidden');
    } catch (error) {
        console.error('結果履歴取得エラー:', error);
    }
}

async function editMatchResults(matchId) {
    const form = document.getElementById('match-results-form');
    const container = document.getElementById('match-results-container');
    const list = document.getElementById('round-list');
    const selected = list.querySelector('.round-list-item.selected');
    if (!selected) return;
    const roundId = selected.dataset.roundId;

    try {
        // 現在の結果を取得
        const matchResponse = await fetch(`/api/matches/${matchId}`);
        const match = await matchResponse.json();

        // 後で使用するためにプレイヤーIDを保存
        currentMatchResults[matchId] = match.players;

        // プルダウンとポイント入力のフォーム（現在の値を設定）
        container.innerHTML = `
            <div class="match-result-entry" data-match-id="${matchId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="result-select">
                                    <option value="win" ${match.results.find(r => r.player_id === p.id)?.win === 1 ? 'selected' : ''}>勝ち</option>
                                    <option value="lose" ${match.results.find(r => r.player_id === p.id)?.loss === 1 ? 'selected' : ''}>負け</option>
                                    <option value="draw" ${match.results.find(r => r.player_id === p.id)?.draw === 1 ? 'selected' : ''}>引き分け</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="${match.results.find(r => r.player_id === p.id)?.points || 0}" class="points-input">
                            </label>
                        </div>
                    </div>
                ` : `<div class="player-result"><em>BYE - 該当なし</em></div>`).join('')}
            </div>
        `;

        document.getElementById('match-form-title').textContent = '結果を修正';
        form.classList.remove('hidden');
    } catch (error) {
        console.error('結果取得エラー:', error);
    }
}

function cancelEdit() {
    document.getElementById('match-results-form').classList.add('hidden');
}

async function submitMatchResults() {
    const form = document.getElementById('match-results-form');
    const container = document.getElementById('match-results-container');
    const matchId = parseInt(container.querySelector('.match-result-entry').dataset.matchId);

    const results = Array.from(container.querySelectorAll('.player-result')).map((el, i) => {
        const playerData = currentMatchResults[matchId]?.[i];
        const resultSelect = el.querySelector('.result-select').value;
        const points = parseInt(el.querySelector('.points-input').value) || 0;

        let win = 0, loss = 0, draw = 0;
        if (resultSelect === 'win') win = 1;
        else if (resultSelect === 'lose') loss = 1;
        else if (resultSelect === 'draw') draw = 1;

        return {
            player_id: playerData?.id || null,
            win: win,
            loss: loss,
            draw: draw,
            points: points
        };
    });

    try {
        const response = await fetch('/api/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId, results: results })
        });

        if (response.ok) {
            form.classList.add('hidden');
            alert('結果を更新しました！');
            const list = document.getElementById('round-list');
            const selected = list.querySelector('.round-list-item.selected');
            if (selected) {
                await viewRoundMatches(selected.dataset.roundId);
            }
            refreshStandings();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '結果の更新に失敗しました'));
        }
    } catch (error) {
        console.error('結果更新エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function refreshStandings() {
    try {
        const response = await fetch('/api/standings');
        const standings = await response.json();

        const tbody = document.getElementById('standings-body');
        tbody.innerHTML = standings.map((s, i) => `
            <tr>
                <td>${s.rank}</td>
                <td>${escapeHtml(s.name)}</td>
                <td>${s.wins}</td>
                <td>${s.losses}</td>
                <td>${s.draws}</td>
                <td><strong>${s.points}</strong></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('順位読み込みエラー:', error);
    }
}

async function refreshMatches() {
    await loadRoundSelect();
    const list = document.getElementById('round-list');
    const selected = list.querySelector('.round-list-item.selected');
    if (selected) {
        await viewRoundMatches(selected.dataset.roundId);
    } else {
        document.getElementById('matches-container').innerHTML = '';
    }
}

// ラウンドリストを読み込み
async function loadRoundSelect() {
    const list = document.getElementById('round-list');
    try {
        const response = await fetch('/api/rounds');
        const rounds = await response.json();

        // リストをクリア
        list.innerHTML = '';

        // 過去のラウンドを追加（最新順）
        if (rounds.length === 0) {
            list.innerHTML = '<li class="round-list-empty">-- 選択してください --</li>';
            return;
        }

        rounds.forEach(round => {
            const li = document.createElement('li');
            li.className = 'round-list-item';
            li.textContent = `第${round.round_number}ラウンド`;
            li.dataset.roundId = round.id;
            list.appendChild(li);
        });
    } catch (error) {
        console.error('ラウンド読み込みエラー:', error);
    }
}

// ラウンドリストのクリック処理
function handleRoundClick(e) {
    const item = e.target.closest('.round-list-item');
    if (!item) return;

    // 選択状態を更新
    document.querySelectorAll('.round-list-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');

    const roundId = item.dataset.roundId;
    viewRoundMatches(roundId);
}

// 最初のラウンドを選択（リスト表示向け）
function selectFirstRound() {
    const list = document.getElementById('round-list');
    const firstItem = list.querySelector('.round-list-item');
    if (firstItem) {
        firstItem.classList.add('selected');
        viewRoundMatches(firstItem.dataset.roundId);
    }
}

// 参加者リストを読み込み
async function loadParticipantList() {
    const list = document.getElementById('participant-list');
    try {
        const response = await fetch('/api/participants');
        const participants = await response.json();

        // リストをクリア
        list.innerHTML = '';

        // 参加者を追加
        if (participants.length === 0) {
            list.innerHTML = '<li class="round-list-empty">-- 参加者がいません --</li>';
            return;
        }

        participants.forEach(participant => {
            const li = document.createElement('li');
            li.className = 'round-list-item';
            li.textContent = participant.name;
            li.dataset.participantId = participant.id;
            list.appendChild(li);
        });
    } catch (error) {
        console.error('参加者リスト読み込みエラー:', error);
    }
}

// 参加者のクリック処理
function handleParticipantClick(e) {
    const item = e.target.closest('.round-list-item');
    if (!item) return;

    const participantId = item.dataset.participantId;
    if (!participantId) return;

    // 参加者選択状態を更新
    document.querySelectorAll('.round-list-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');

    // 選択した参加者の試合結果を表示
    showPlayerMatchResults(participantId);
}

// 選択した参加者の試合結果を表示
let currentPlayerId = null;

async function showPlayerMatchResults(participantId) {
    currentPlayerId = participantId;
    const form = document.getElementById('player-match-form');
    form.classList.add('hidden');

    try {
        const response = await fetch(`/api/players/${participantId}/matches`);
        const data = await response.json();

        const participantRow = document.querySelector(`.participant-row[data-participant-id="${participantId}"]`);
        const resultsRow = document.getElementById('player-match-results-row');

        if (data.matches.length === 0) {
            const container = document.getElementById('player-match-list');
            container.innerHTML = '<p>この参加者の試合はまだありません。</p>';
            resultsRow.classList.remove('hidden');

            // 合計も表示
            const totalStats = document.getElementById('player-match-total-stats');
            totalStats.innerHTML = '<p>試合がないため、合計もありません。</p>';
            return;
        }

        // 合計統計を計算
        const totalStats = data.total_stats || { wins: 0, losses: 0, draws: 0, points: 0 };
        const totalStatsHtml = `
            <div class="player-total-stats">
                <h4>全ラウンド合計</h4>
                <p>勝ち: ${totalStats.wins} / 負け: ${totalStats.losses} / 引き分け: ${totalStats.draws} / ポイント: ${totalStats.points}</p>
            </div>
        `;

        // ラウンドごとにグループ化
        const rounds = {};
        data.matches.forEach(match => {
            if (!rounds[match.round_id]) {
                rounds[match.round_id] = {
                    round_number: match.round_number,
                    matches: []
                };
            }
            rounds[match.round_id].matches.push(match);
        });

        let html = totalStatsHtml;
        Object.values(rounds).forEach(round => {
            html += `<div class="player-round-section" data-round-id="${round.round_id}">`;
            html += `<h4>第${round.round_number}ラウンド</h4>`;
            html += `<div class="player-round-matches">`;

            round.matches.forEach(match => {
                const statusClass = match.completed ? 'completed' : '';

                // 全プレイヤー情報
                const allPlayers = match.players || [];

                // 自分の結果（完了している場合）
                let myWin = '-', myLoss = '-', myDraw = '-', myPoints = '-';
                if (match.completed) {
                    // APIレスポンスのplayers配列を確認
                    const myData = allPlayers.find(p => p && p.id == participantId);
                    if (myData && myData.result) {
                        myWin = myData.result.win || 0;
                        myLoss = myData.result.loss || 0;
                        myDraw = myData.result.draw || 0;
                        myPoints = myData.result.points || 0;
                    }
                }

                // 相手プレイヤー
                const opponents = allPlayers.filter(p => p && p.id != participantId && p.name);

                html += `
                    <div class="player-match-card ${statusClass}">
                        <div class="player-match-header">
                            <h4>テーブル ${match.table_number}</h4>
                            <div class="match-status">${match.completed ? '<span class="status-completed">完了</span>' : '<span class="status-pending">未完了</span>'}</div>
                        </div>
                        <div class="player-match-players">
                            <span class="players-label">出場者:</span>
                            <div class="players-list">
                                ${allPlayers.map(p => p && p.id ? escapeHtml(p.name) : 'BYE').join(' / ')}
                            </div>
                        </div>
                        <div class="player-match-my-result">
                            <span class="result-label">私の成績:</span>
                            <span class="result-values">
                                勝: ${myWin} / 負: ${myLoss} / 引: ${myDraw} / ポイント: ${myPoints}
                            </span>
                        </div>
                        <div class="player-match-actions">
                            ${match.completed
                                ? `<button class="btn-secondary" onclick="editPlayerMatch(${match.match_id}, ${match.round_id}, ${match.table_number})">結果を修正</button>`
                                : `<button class="btn-primary" onclick="editPlayerMatch(${match.match_id}, ${match.round_id}, ${match.table_number})">結果を記録</button>`
                            }
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        const container = document.getElementById('player-match-list');
        container.innerHTML = html;
        resultsRow.classList.remove('hidden');

        // 参加者行を強調表示
        participantRow.classList.add('highlighted');
    } catch (error) {
        console.error('参加者試合結果取得エラー:', error);
        alert('試合結果の取得に失敗しました');
    }
}

// 試合結果セクションを隠す
function hidePlayerMatchResults() {
    document.getElementById('player-match-results-row').classList.add('hidden');
    // 参加者行の強調表示を解除
    if (currentPlayerId) {
        const participantRow = document.querySelector(`.participant-row[data-participant-id="${currentPlayerId}"]`);
        if (participantRow) {
            participantRow.classList.remove('highlighted');
        }
    }
    currentPlayerId = null;
}

// 参加者試合結果フォームを表示
let currentEditMatchData = null;

async function editPlayerMatch(matchId, roundId, tableNumber) {
    try {
        const response = await fetch(`/api/matches/${matchId}`);
        const match = await response.json();

        const form = document.getElementById('player-match-form');
        const container = document.getElementById('player-match-form-container');

        currentMatchResults[matchId] = match.players;

        // テーブル番号とラウンドIDをデータ属性に保存
        container.innerHTML = `
            <div class="player-match-form-entry" data-match-id="${matchId}" data-table-number="${tableNumber}" data-round-id="${roundId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result ${p.id === currentPlayerId ? '' : 'disabled'}" data-player-id="${p.id}">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="player-result-select" ${p.id === currentPlayerId ? '' : 'disabled'}>
                                    <option value="win">勝ち</option>
                                    <option value="lose" selected>負け</option>
                                    <option value="draw">引き分け</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="0" class="player-points-input" ${p.id === currentPlayerId ? '' : 'disabled'}>
                            </label>
                        </div>
                    </div>
                ` : `<div class="player-result"><em>BYE - 該当なし</em></div>`).join('')}
            </div>
        `;

        document.getElementById('player-match-form-title').textContent = `結果を修正 (テーブル ${tableNumber})`;
        form.classList.remove('hidden');
    } catch (error) {
        console.error('試合詳細取得エラー:', error);
        alert('試合詳細の取得に失敗しました');
    }
}

// 参加者試合結果フォームを隠す
function hidePlayerMatchForm() {
    document.getElementById('player-match-form').classList.add('hidden');
    // 参加者結果セクションを隠す
    hidePlayerMatchResults();
}

// 参加者試合結果を提出
async function submitPlayerMatchResult() {
    const form = document.getElementById('player-match-form');
    const container = document.getElementById('player-match-form-container');
    const matchId = parseInt(container.querySelector('.player-match-form-entry').dataset.matchId);

    // ラウンドIDとテーブル番号をフォームから直接取得
    const formEntry = container.querySelector('.player-match-form-entry');
    const formRoundId = formEntry.dataset.roundId;
    const tableNumber = parseInt(formEntry.dataset.tableNumber);

    if (!formRoundId) {
        alert('ラウンド情報が取得できませんでした');
        return;
    }

    const playerResults = Array.from(container.querySelectorAll('.player-result')).map((el, i) => {
        const playerData = currentMatchResults[matchId]?.[i];
        const resultSelect = el.querySelector('.player-result-select').value;
        const points = parseInt(el.querySelector('.player-points-input').value) || 0;

        let win = 0, loss = 0, draw = 0;
        if (resultSelect === 'win') win = 1;
        else if (resultSelect === 'lose') loss = 1;
        else if (resultSelect === 'draw') draw = 1;

        return {
            player_id: playerData?.id || null,
            win: win,
            loss: loss,
            draw: draw,
            points: points
        };
    });

    try {
        const response = await fetch(`/api/players/${currentPlayerId}/round/${formRoundId}/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                match_id: matchId,
                table_number: tableNumber,
                results: playerResults
            })
        });

        if (response.ok) {
            form.classList.add('hidden');
            alert('結果を更新しました！');
            if (currentPlayerId) {
                await showPlayerMatchResults(currentPlayerId);
            }
            // 順位表と参加者管理を更新
            refreshStandings();
            loadParticipants();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '結果の更新に失敗しました'));
        }
    } catch (error) {
        console.error('結果更新エラー:', error);
        alert('エラー: ' + error.message);
    }
}

// 参加者試合結果エリアを隠す
function hidePlayerMatchResults() {
    document.getElementById('player-match-results').classList.add('hidden');
    // 選択状態を解除
    document.querySelectorAll('.round-list-item').forEach(i => i.classList.remove('selected'));
    // 参加者選択も解除
    document.querySelectorAll('#participant-list .round-list-item').forEach(i => i.classList.remove('selected'));
}

// グローバルストア - 現在の試合結果データ
let currentMatchResults = {};

async function showMatchResults(matchId) {
    const form = document.getElementById('match-results-form');
    const container = document.getElementById('match-results-container');
    const list = document.getElementById('round-list');
    const selected = list.querySelector('.round-list-item.selected');
    if (!selected) return;
    const roundId = selected.dataset.roundId;

    try {
        const matchResponse = await fetch(`/api/matches/round/${roundId}`);
        const matchData = await matchResponse.json();
        const match = matchData.matches.find(m => m.id === matchId);

        if (!match) return;

        // 後で使用するためにプレイヤーIDを保存
        currentMatchResults[matchId] = match.players;

        // プルダウンとポイント入力のフォーム（デフォルトは負け）
        container.innerHTML = `
            <div class="match-result-entry" data-match-id="${matchId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="result-select">
                                    <option value="win">勝ち</option>
                                    <option value="lose" selected>負け</option>
                                    <option value="draw">引き分け</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="0" class="points-input" placeholder="例: 15">
                            </label>
                        </div>
                    </div>
                ` : `<div class="player-result"><em>BYE - 該当なし</em></div>`).join('')}
            </div>
        `;

        document.getElementById('match-form-title').textContent = '結果を記録';
        form.classList.remove('hidden');
    } catch (error) {
        console.error('試合詳細取得エラー:', error);
    }
}

async function clearAllData() {
    if (!confirm('すべてのトーナメントデータが削除されます。よろしいですか？')) return;

    try {
        const response = await fetch('/api/clear', { method: 'POST' });

        if (response.ok) {
            alert('すべてのデータをクリアしました！');
            location.reload();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || 'データのクリアに失敗しました'));
        }
    } catch (error) {
        console.error('データクリアエラー:', error);
        alert('エラー: ' + error.message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
