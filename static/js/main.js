/* Pokemon Za トーナメントマネージャー - メインJavaScript */

// 現在のユーザー
let currentUser = null;

// 組み合わせ編集モード用の状態
let editPairingState = {
    active: false,
    selectedCells: [] // 選択されたプレイヤーのセル
};

document.addEventListener('DOMContentLoaded', async () => {
    // 現在のユーザーをチェック
    await checkUserSession();

    // アカウント管理タブの表示制御（管理者のみ表示）
    if (currentUser && currentUser.is_admin) {
        const usersTab = document.getElementById('users-tab');
        if (usersTab) {
            usersTab.style.display = 'block';
        }
        // 初期タブを参加者に設定
        document.querySelector('[data-tab="participants"]').classList.add('active');
        document.getElementById('participants').classList.add('active');
    } else if (currentUser) {
        // 非管理者にはアカウント管理タブを隠す
        const usersTab = document.getElementById('users-tab');
        if (usersTab) {
            usersTab.style.display = 'none';
        }
    }

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
            } else if (tabName === 'users') {
                loadUsers();
            }
        });
    });

    // 試合生成ボタン
    document.getElementById('generate-matches-btn').addEventListener('click', generateMatches);

    // ラウンドリストのクリックイベント
    document.getElementById('round-list').addEventListener('click', handleRoundClick);

    // ラウンド削除ボタン
    document.getElementById('delete-round-btn').addEventListener('click', handleDeleteRound);

    // 組み合わせ編集ボタン
    document.getElementById('edit-pairing-btn').addEventListener('click', toggleEditPairingMode);

    // マッチテーブルのクリック（プレイヤー選択用）
    document.getElementById('matches-container').addEventListener('click', handleMatchTableClick);

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

    // 管理者なら参加者キャッシュを読み込み
    if (currentUser && currentUser.is_admin) {
        loadParticipantsCache();
    }
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

    // 初期データ読み込み（タブがアクティブな場合）
    if (currentUser && currentUser.is_admin) {
        // 管理者はアカウント管理タブを表示しない（デフォルトで参加者タブ）
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="participants"]').classList.add('active');
        document.getElementById('participants').classList.add('active');
    }

    // 参加者キャッシュを読み込み
    await loadParticipantsCache();
});

// 参加者キャッシュ
let participantsCache = [];

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

// 全参加者をキャッシュ
async function loadParticipantsCache() {
    try {
        const response = await fetch('/api/participants');
        if (response.ok) {
            participantsCache = await response.json();
        }
    } catch (error) {
        console.error('参加者キャッシュ読み込みエラー:', error);
    }
}

// ユーザー名から参加者名を取得
function getParticipantName(participantId) {
    const participant = participantsCache.find(p => p.id === participantId);
    return participant ? participant.name : `参加者#${participantId}`;
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

// 新規登録
async function handleRegister(username, password) {
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            return { success: true };
        } else {
            const error = await response.json();
            return { success: false, error: error.error || '登録に失敗しました' };
        }
    } catch (error) {
        return { success: false, error: error.message || 'エラーが発生しました' };
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

        // 管理者か通常ユーザーかで表示を分ける
        const is_admin = currentUser && currentUser.is_admin;

        const tbody = document.getElementById('participants-body');
        
        if (participants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">参加者がいません</td></tr>';
            return;
        }

        tbody.innerHTML = participants.map(p => {
            // 非管理者の場合、自分の参加者のみ表示し、削除ボタンを隠す
            const canModify = is_admin || (currentUser && currentUser.participant_id === p.id);
            
            return `
            <tr class="participant-row" data-participant-id="${p.id}">
                <td>${escapeHtml(p.name)}</td>
                <td>${p.win_count}</td>
                <td>${p.loss_count}</td>
                <td>${p.draw_count}</td>
                <td>${p.points}</td>
                <td>
                    <div class="player-actions">
                        ${canModify ? `<button class="btn-result" onclick="showPlayerMatchResults(${p.id})">結果登録</button>` : ''}
                        ${is_admin ? `<button class="btn-delete" onclick="deleteParticipant(${p.id})">削除</button>` : ''}
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error('参加者読み込みエラー:', error);
    }
}

async function generateMatches() {
    // プログレスバー表示
    const btn = document.getElementById('generate-matches-btn');
    const originalText = btn.textContent;
    btn.textContent = '処理中...';
    btn.disabled = true;
    showProgressBar();

    try {
        const response = await fetch('/api/matches/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        hideProgressBar();

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
        hideProgressBar();
        console.error('試合生成エラー:', error);
        alert('エラー: ' + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// プログレスバー表示
function showProgressBar() {
    let container = document.getElementById('progress-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'progress-container';
        container.className = 'progress-container';
        container.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <p class="progress-text">試合を生成中です...</p>
        `;
        const matchesTab = document.getElementById('matches');
        matchesTab.insertBefore(container, matchesTab.firstChild);
    } else {
        container.style.display = 'block';
    }
    // アニメーションをリセット
    const fill = container.querySelector('.progress-fill');
    fill.style.animation = 'none';
    fill.offsetHeight; /* trigger reflow */
    fill.style.animation = 'progress-fill 1.5s ease-in-out infinite';
}

// プログレスバー非表示
function hideProgressBar() {
    const container = document.getElementById('progress-container');
    if (container) {
        container.style.display = 'none';
    }
}

async function viewRoundMatches(roundId) {
    try {
        // 削除ボタンと編集ボタンの状態を更新（結果が1つでも記録されていれば非表示）
        const selected = document.querySelector('.round-list-item.selected');
        const canDelete = selected && selected.dataset.canDelete === 'true';

        document.getElementById('delete-round-btn').style.display = canDelete ? 'inline-block' : 'none';
        document.getElementById('edit-pairing-btn').style.display = canDelete ? 'inline-block' : 'none';

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
                <tr data-match-id="${match.id}" data-table="${match.table_number}">
                    <td>テーブル ${match.table_number}</td>
                    <td class="player-cell" data-player-id="${players[0]?.id || ''}" data-slot="0">${escapeHtml(players[0]?.name || 'BYE')}</td>
                    <td class="player-cell" data-player-id="${players[1]?.id || ''}" data-slot="1">${escapeHtml(players[1]?.name || 'BYE')}</td>
                    <td class="player-cell" data-player-id="${players[2]?.id || ''}" data-slot="2">${escapeHtml(players[2]?.name || 'BYE')}</td>
                    <td class="player-cell" data-player-id="${players[3]?.id || ''}" data-slot="3">${escapeHtml(players[3]?.name || 'BYE')}</td>
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

        // プルダウンとポイント入力のフォーム（現在の値を設定、未記録は-）
        container.innerHTML = `
            <div class="match-result-entry" data-match-id="${matchId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}" data-player-id="${p.id}">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="result-select" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
                                    <option value="win" ${match.results.find(r => r.player_id === p.id)?.win === 1 ? 'selected' : ''}>勝ち</option>
                                    <option value="lose" ${match.results.find(r => r.player_id === p.id)?.loss === 1 ? 'selected' : ''}>負け</option>
                                    <option value="draw" ${match.results.find(r => r.player_id === p.id)?.draw === 1 ? 'selected' : ''}>引き分け</option>
                                    <option value="" ${!match.results.find(r => r.player_id === p.id) ? 'selected' : ''}>-</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="${match.results.find(r => r.player_id === p.id)?.points || ''}" class="points-input" placeholder="例: 15" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
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

    // すべてのプレイヤーが未記録かどうかチェック
    const resultSelects = container.querySelectorAll('.result-select');
    let allEmpty = true;
    for (const select of resultSelects) {
        if (select.value) {
            allEmpty = false;
            break;
        }
    }

    if (allEmpty) {
        alert('結果を記録してください（少なくとも1人のプレイヤーを選択してください）。');
        return;
    }

    const results = Array.from(container.querySelectorAll('.player-result')).map((el, i) => {
        const playerData = currentMatchResults[matchId]?.[i];
        const resultSelect = el.querySelector('.result-select').value;
        const pointsInput = el.querySelector('.points-input').value;
        const points = pointsInput ? parseInt(pointsInput) : 0;

        let win = 0, loss = 0, draw = 0;
        if (resultSelect === 'win') win = 1;
        else if (resultSelect === 'lose') loss = 1;
        else if (resultSelect === 'draw') draw = 1;

        // 結果が選択されていない（空）場合は送信しない
        // resultSelectが空、win/loss/drawのいずれも1でない場合は未記録とみなす
        const hasWinLossDraw = resultSelect === 'win' || resultSelect === 'lose' || resultSelect === 'draw';
        if (!hasWinLossDraw) {
            return null;
        }

        return {
            player_id: playerData?.id || null,
            win: win,
            loss: loss,
            draw: draw,
            points: points
        };
    }).filter(r => r !== null);

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
    // 編集モードをリセット
    editPairingState.active = false;
    editPairingState.selectedCells = [];
    document.getElementById('edit-pairing-btn').textContent = '組み合わせを編集';
    document.getElementById('edit-pairing-btn').className = 'btn-secondary';
    document.querySelectorAll('.player-cell.selected').forEach(cell => cell.classList.remove('selected'));
}

// ラウンドリストを再読み込み（削除時などに使用）
async function loadRounds() {
    await loadRoundSelect();
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
            li.dataset.roundNumber = round.round_number;
            li.dataset.canDelete = round.can_delete;
            list.appendChild(li);
        });

        // 最初のラウンドが選択可能かチェック
        const firstItem = list.querySelector('.round-list-item');
        if (firstItem) {
            firstItem.classList.add('selected');
        }
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

// ラウンド削除処理
async function handleDeleteRound() {
    const selected = document.querySelector('.round-list-item.selected');
    if (!selected) return;

    const roundId = selected.dataset.roundId;
    const roundNumber = selected.dataset.roundNumber;

    // 結果が記録されている場合は削除不可（UI側で非表示にするが、念のためチェック）
    if (!selected.dataset.canDelete || selected.dataset.canDelete === 'false') {
        alert('結果が記録されているラウンドは削除できません。');
        return;
    }

    // 削除確認
    if (!confirm(`ラウンド ${roundNumber} を削除します。よろしいですか？\n（この操作は取り消せません）`)) {
        return;
    }

    try {
        const response = await fetch(`/api/rounds/${roundId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error || '削除に失敗しました。');
            return;
        }

        alert('ラウンドを削除しました。');

        // リストを再読み込み
        await loadRounds();

        // 選択状態をクリア
        document.querySelectorAll('.round-list-item').forEach(i => i.classList.remove('selected'));
        document.getElementById('matches-container').innerHTML = '<p class="no-matches">ラウンドを選択してください。</p>';
        document.getElementById('delete-round-btn').style.display = 'none';
        document.getElementById('edit-pairing-btn').style.display = 'none';
        // 編集モードを解除
        editPairingState.active = false;
        editPairingState.selectedCells = [];
        // 選択クラスをすべてクリア
        document.querySelectorAll('.player-cell.selected').forEach(cell => cell.classList.remove('selected'));
    } catch (error) {
        console.error('ラウンド削除エラー:', error);
        alert('削除中にエラーが発生しました。');
    }
}

// 組み合わせ編集モードの切り替え
function toggleEditPairingMode() {
    editPairingState.active = !editPairingState.active;
    if (editPairingState.active) {
        document.getElementById('edit-pairing-btn').textContent = '組み合わせを確定';
        document.getElementById('edit-pairing-btn').className = 'btn-primary';
        alert('プレイヤーを選択して入れ替えます。\n1. 1人目のプレイヤーをクリック\n2. 2人目のプレイヤーをクリック\n（同じテーブル内のプレイヤーのみ入れ替え可能）');
    } else {
        document.getElementById('edit-pairing-btn').textContent = '組み合わせを編集';
        document.getElementById('edit-pairing-btn').className = 'btn-secondary';
        document.querySelectorAll('.player-cell.selected').forEach(cell => cell.classList.remove('selected'));
    }
}

// マッチテーブルのクリック処理（プレイヤー選択）
function handleMatchTableClick(e) {
    if (!editPairingState.active) return;

    const cell = e.target.closest('.player-cell');
    if (!cell) return;

    const matchId = cell.closest('tr').dataset.matchId;
    const tableNumber = cell.closest('tr').dataset.table;
    const playerId = cell.dataset.playerId;
    const slot = parseInt(cell.dataset.slot);

    // BYEは選択不可
    if (!playerId || playerId === '') return;

    // 既に選択されている場合は選択解除
    if (editPairingState.selectedCells.includes(cell)) {
        cell.classList.remove('selected');
        editPairingState.selectedCells = editPairingState.selectedCells.filter(c => c !== cell);
        return;
    }

    // 選択（2人まで）
    if (editPairingState.selectedCells.length < 2) {
        cell.classList.add('selected');
        editPairingState.selectedCells.push({ cell, matchId, tableNumber, playerId, slot });

        // 2人選択されたら入れ替え
        if (editPairingState.selectedCells.length === 2) {
            swapPlayers();
        }
    }
}

// プレイヤーの入れ替え処理
async function swapPlayers() {
    const [player1, player2] = editPairingState.selectedCells;

    // 入れ替え確認
    const playerName1 = player1.cell.textContent.trim();
    const playerName2 = player2.cell.textContent.trim();
    if (!confirm(`${playerName1} と ${playerName2} を入れ替えます。よろしいですか？`)) {
        resetEditSelection();
        return;
    }

    try {
        // 異なるテーブルの場合は個別に更新、同じテーブルの場合は一括更新
        if (player1.matchId === player2.matchId && player1.slot !== player2.slot) {
            // 同じテーブル内で入れ替え
            const response = await fetch(`/api/matches/${player1.matchId}/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slot1: player1.slot,
                    slot2: player2.slot
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert('エラー: ' + (error.error || '入れ替えに失敗しました'));
                resetEditSelection();
                return;
            }
        } else {
            // 異なるテーブルの場合は、それぞれのスロットを更新
            // まずplayer1を空にしてからplayer2を移動、その後player1を追加
            await swapPlayersAcrossTables(player1, player2);
        }

        alert('入れ替えが完了しました。');
        resetEditSelection();
        // マッチリストを再読み込み
        await viewRoundMatches(document.querySelector('.round-list-item.selected').dataset.roundId);
    } catch (error) {
        console.error('プレイヤー入れ替えエラー:', error);
        alert('入れ替え中にエラーが発生しました。');
        resetEditSelection();
    }
}

// 異なるテーブル間のプレイヤー入れ替え
async function swapPlayersAcrossTables(player1, player2) {
    // 各マッチのデータを取得
    const response1 = await fetch(`/api/matches/${player1.matchId}`);
    const match1 = await response1.json();

    const response2 = await fetch(`/api/matches/${player2.matchId}`);
    const match2 = await response2.json();

    // プレイヤーIDを取得（BYEはnullとして扱う）
    const player1Id = player1.playerId;
    const player2Id = player2.playerId;

    // slot -> player_id のマッピング
    const slotToField = {
        0: 'player1_id',
        1: 'player2_id',
        2: 'player3_id',
        3: 'player4_id'
    };

    // マッチ1のスロット1を空にする（プレイヤー2をそこに移す）
    // マッチ2のスロット2を空にする（プレイヤー1をそこに移す）

    // マッチ1: player1のスロットをプレイヤー2に変更
    let response = await fetch(`/api/matches/${player1.matchId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            slot: player1.slot,
            player_id: player2Id
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '入れ替えに失敗しました');
    }

    // マッチ2: player2のスロットをプレイヤー1に変更
    response = await fetch(`/api/matches/${player2.matchId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            slot: player2.slot,
            player_id: player1Id
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '入れ替えに失敗しました');
    }
}

// 編集選択のリセット
function resetEditSelection() {
    editPairingState.selectedCells.forEach(item => item.cell.classList.remove('selected'));
    editPairingState.selectedCells = [];
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

        // 既存の結果を取得
        const existingResults = {};
        if (match.results) {
            match.results.forEach(r => {
                existingResults[r.player_id] = r;
            });
        }

        currentMatchResults[matchId] = match.players;

        // テーブル番号とラウンドIDをデータ属性に保存
        container.innerHTML = `
            <div class="player-match-form-entry" data-match-id="${matchId}" data-table-number="${tableNumber}" data-round-id="${roundId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}" data-player-id="${p.id}">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="player-result-select" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
                                    <option value="win" ${existingResults[p.id]?.win === 1 ? 'selected' : ''}>勝ち</option>
                                    <option value="lose" ${existingResults[p.id]?.loss === 1 ? 'selected' : ''}>負け</option>
                                    <option value="draw" ${existingResults[p.id]?.draw === 1 ? 'selected' : ''}>引き分け</option>
                                    <option value="" ${!existingResults[p.id] ? 'selected' : ''}>-</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="${existingResults[p.id]?.points || ''}" class="player-points-input" placeholder="例: 15" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
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

    // すべてのプレイヤーが未記録かどうかチェック
    const resultSelects = container.querySelectorAll('.player-result-select');
    let allEmpty = true;
    for (const select of resultSelects) {
        if (select.value) {
            allEmpty = false;
            break;
        }
    }

    if (allEmpty) {
        alert('結果を記録してください（少なくとも1人のプレイヤーを選択してください）。');
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

        // 結果が選択されていない（空）場合は送信しない
        // resultSelectが空、win/loss/drawのいずれも1でない場合は未記録とみなす
        const hasWinLossDraw = resultSelect === 'win' || resultSelect === 'lose' || resultSelect === 'draw';
        if (!hasWinLossDraw) {
            return null;
        }

        return {
            player_id: playerData?.id || null,
            win: win,
            loss: loss,
            draw: draw,
            points: points
        };
    }).filter(r => r !== null);

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
        } else if (response.status === 403) {
            alert('アクセスが拒否されました');
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

        // プルダウンとポイント入力のフォーム（デフォルトは未記録）
        container.innerHTML = `
            <div class="match-result-entry" data-match-id="${matchId}">
                ${match.players.map((p, i) => p.id ? `
                    <div class="player-result ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}" data-player-id="${p.id}">
                        <span>${escapeHtml(p.name)}:</span>
                        <div class="result-inputs">
                            <label>
                                結果:
                                <select class="result-select" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
                                    <option value="win">勝ち</option>
                                    <option value="lose">負け</option>
                                    <option value="draw">引き分け</option>
                                    <option value="" selected>-</option>
                                </select>
                            </label>
                            <label>
                                ポイント:
                                <input type="number" min="0" value="" class="points-input" placeholder="例: 15" ${!currentUser || currentUser.is_admin || p.id === currentUser.participant_id ? '' : 'disabled'}>
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

// アカウント管理機能
async function loadUsers() {
    // 参加者キャッシュを更新
    await loadParticipantsCache();

    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        usersCache = users; // キャッシュに保存

        const tbody = document.getElementById('users-body');

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">アカウントがありません</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr class="user-row" data-user-id="${u.id}">
                <td>${escapeHtml(u.username)}</td>
                <td>${u.is_admin ? '<span style="color: #48bb78;">はい</span>' : 'いいえ'}</td>
                <td>${u.is_approved ? '<span style="color: #48bb78;">承認済み</span>' : '<span style="color: #e53e3e;">未承認</span>'}</td>
                <td>
                    <div class="user-actions">
                        ${!u.is_approved ? `<button class="btn-approve" onclick="approveUser(${u.id})">承認する</button>` : ''}
                        ${u.reset_password ? `<button class="btn-reset-password" onclick="resetPassword(${u.id})">パスワード初期化</button>` : ''}
                        ${u.id !== currentUser.id ? `<button class="btn-delete" onclick="deleteUser(${u.id})">削除</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('ユーザー読み込みエラー:', error);
        alert('ユーザーの読み込みに失敗しました');
    }
}

async function deleteUser(id) {
    if (!confirm('このアカウントを削除しますか？')) return;

    try {
        const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });

        if (response.ok) {
            loadUsers();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || 'アカウントの削除に失敗しました'));
        }
    } catch (error) {
        console.error('アカウント削除エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function approveUser(id) {
    if (!confirm('このユーザーのアカウントを承認しますか？承認後、ユーザーはログインできるようになります。')) return;

    try {
        const response = await fetch(`/api/users/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            loadUsers();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '承認に失敗しました'));
        }
    } catch (error) {
        console.error('承認エラー:', error);
        alert('エラー: ' + error.message);
    }
}

async function resetPassword(id) {
    if (!confirm('このユーザーのパスワードを初期化しますか？')) return;

    try {
        const response = await fetch(`/api/users/${id}/reset_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (response.ok) {
            // Show password in a text input for copying
            const newPass = data.new_password;
            const container = document.createElement('div');
            container.innerHTML = `
                <div style="text-align: left; margin-bottom: 15px;">
                    <p style="margin-bottom: 10px;"><strong>初期化されたパスワード:</strong></p>
                    <input type="text" value="${newPass}" id="reset-password-display" style="width: 100%; padding: 10px; font-size: 16px; text-align: center;" readonly onclick="this.select()">
                    <p style="margin-top: 10px; font-size: 12px; color: #666;">パスワードをコピーしてユーザーに安全な方法で伝えてください</p>
                </div>
            `;
            container.querySelector('input').select();

            // Use a custom modal-style alert
            const alertDiv = document.createElement('div');
            alertDiv.id = 'reset-password-modal';
            alertDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 1000; max-width: 400px; width: 90%;';
            alertDiv.innerHTML = `
                <h3 style="margin-top: 0; text-align: center;">パスワード初期化完了</h3>
                ${container.innerHTML}
                <div style="text-align: center;">
                    <button onclick="closeResetPasswordModal()" style="padding: 8px 20px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">閉じる</button>
                </div>
            `;
            document.body.appendChild(alertDiv);

            loadUsers();
        } else {
            const error = data;
            alert('エラー: ' + (error.error || 'パスワードの初期化に失敗しました'));
        }
    } catch (error) {
        console.error('パスワード初期化エラー:', error);
        alert('エラー: ' + error.message);
    }
}

function closeResetPasswordModal() {
    const modal = document.getElementById('reset-password-modal');
    if (modal) {
        modal.remove();
    }
}

async function toggleAdmin(id) {
    const user = usersCache.find(u => u.id === id);
    if (!user) return;

    const action = user.is_admin ? '管理者から外します' : '管理者に昇格させます';
    if (!confirm(`${escapeHtml(user.username)} を${action}。よろしいですか？`)) return;

    try {
        const response = await fetch(`/api/users/${id}/admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            loadUsers();
        } else if (response.status === 401) {
            alert('ログインが必要です');
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('エラー: ' + (error.error || '操作に失敗しました'));
        }
    } catch (error) {
        console.error('管理者変更エラー:', error);
        alert('エラー: ' + error.message);
    }
}

// ユーザー名から参加者名を取得（キャッシュ付き）
let usersCache = [];
function getParticipantName(participantId) {
    // ここで簡易的にユーザー名を返す（実際にはParticipantテーブルから取得すべき）
    const user = usersCache.find(u => u.id === participantId);
    return user ? user.username : `参加者#${participantId}`;
}

function viewParticipant(participantId) {
    // 参加者タブに切り替えて該当参加者を表示
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector('[data-tab="participants"]').classList.add('active');
    document.getElementById('participants').classList.add('active');

    // 参加者セクションで該当行を強調表示
    setTimeout(() => {
        const row = document.querySelector(`.participant-row[data-participant-id="${participantId}"]`);
        if (row) {
            row.classList.add('highlighted');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
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
