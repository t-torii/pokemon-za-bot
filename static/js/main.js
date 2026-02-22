/* Pokemon Za トーナメントマネージャー - メインJavaScript */

document.addEventListener('DOMContentLoaded', () => {
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
            }
        });
    });

    // 参加者管理
    const addParticipantForm = document.getElementById('add-participant-form');
    addParticipantForm.addEventListener('submit', handleAddParticipant);

    // 試合生成ボタン
    document.getElementById('generate-matches-btn').addEventListener('click', generateMatches);

    // ラウンド選択変更時
    document.getElementById('round-select').addEventListener('change', handleRoundChange);

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
});

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
        }
    } catch (error) {
        console.error('参加者の追加エラー:', error);
    }
}

async function deleteParticipant(id) {
    if (!confirm('この参加者を削除しますか？')) return;

    try {
        const response = await fetch(`/api/participants/${id}`, { method: 'DELETE' });

        if (response.ok) {
            loadParticipants();
            refreshStandings();
        }
    } catch (error) {
        console.error('参加者の削除エラー:', error);
    }
}

async function loadParticipants() {
    try {
        const response = await fetch('/api/participants');
        const participants = await response.json();

        const tbody = document.getElementById('participants-body');
        tbody.innerHTML = participants.map(p => `
            <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${p.win_count}</td>
                <td>${p.loss_count}</td>
                <td>${p.draw_count}</td>
                <td>${p.points}</td>
                <td><button class="btn-delete" onclick="deleteParticipant(${p.id})">削除</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('参加者読み込みエラー:', error);
    }
}

async function generateMatches() {
    try {
        const response = await fetch('/api/matches/next');
        const data = await response.json();

        alert(`第${data.round}ラウンドの試合が生成されました！`);
        await loadRoundSelect();
        // 新しいラウンドを選択状態に
        setTimeout(() => {
            const select = document.getElementById('round-select');
            select.value = data.round_id;
            handleRoundChange();
        }, 100);
    } catch (error) {
        console.error('試合生成エラー:', error);
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
    const select = document.getElementById('round-select');
    const roundId = select.value;

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
            const select = document.getElementById('round-select');
            if (select.value) {
                await viewRoundMatches(select.value);
            }
            refreshStandings();
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
    const select = document.getElementById('round-select');
    if (select.value) {
        await viewRoundMatches(select.value);
    } else {
        document.getElementById('matches-container').innerHTML = '';
    }
}

// ラウンド選択ボックスを読み込み
async function loadRoundSelect() {
    const select = document.getElementById('round-select');
    try {
        const response = await fetch('/api/rounds');
        const rounds = await response.json();

        // セレクトボックスをクリア
        select.innerHTML = '<option value="">-- 選択してください --</option>';

        // 過去のラウンドを追加（最新順）
        rounds.forEach(round => {
            const option = document.createElement('option');
            option.value = round.id;
            option.textContent = `第${round.round_number}ラウンド`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('ラウンド読み込みエラー:', error);
    }
}

// ラウンド選択変更時
async function handleRoundChange() {
    const select = document.getElementById('round-select');
    const roundId = select.value;

    if (!roundId) {
        document.getElementById('matches-container').innerHTML = '';
        return;
    }

    await viewRoundMatches(roundId);
}

// グローバルストア - 現在の試合結果データ
let currentMatchResults = {};

async function showMatchResults(matchId) {
    const form = document.getElementById('match-results-form');
    const container = document.getElementById('match-results-container');
    const select = document.getElementById('round-select');
    const roundId = select.value;

    try {
        const matchResponse = await fetch(`/api/matches/round/${roundId}`);
        const matchData = await matchResponse.json();
        const match = matchData.matches.find(m => m.id === matchId);

        if (!match) return;

        // 後で使用するためにプレイヤーIDを保存
        currentMatchResults[matchId] = match.players;

        // プルダウンとポイント入力のフォーム
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
                                    <option value="lose">負け</option>
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
        }
    } catch (error) {
        console.error('データクリアエラー:', error);
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
