// SusFarm - UI Rendering and Interaction
// Wrapped in IIFE to prevent duplicate declaration errors

(() => {
  'use strict';

  // 🚨 Prevent duplicate loading / duplicate paste
  if (window.__SUSFARM_JS_LOADED__) {
    console.warn('[SusFarm] susfarm.js already loaded, skipping');
    return;
  }
  window.__SUSFARM_JS_LOADED__ = true;

  // =========================
  // Constants and Variables
  // =========================

  const MARKET_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

  let currentTab = 'plots';

  // =========================
  // Helper Functions
  // =========================

  // Format time as MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Format number with commas
  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Get translation (renamed to tx to avoid shadowing global window.t)
  function tx(key, vars = {}) {
    if (!key) return '';
    // Use window.t if available, otherwise try I18N directly
    let str = '';
    if (window.t && typeof window.t === 'function') {
      str = window.t(key, window.currentLang || 'en');
    } else if (window.I18N) {
      const lang = window.currentLang || 'en';
      const dict = window.I18N[lang] || window.I18N.en || {};
      str = dict[key] ?? key;
    } else {
      // Fallback: return key if no i18n system available
      return key;
    }
    
    // If translation missing (returns the key itself), return empty string to avoid leaking keys
    // This prevents i18n keys from being displayed in the UI
    if (str === key) {
      console.warn(`[tx] Translation missing for key: ${key}, lang: ${window.currentLang || 'en'}`);
      return ''; // Return empty instead of key to prevent i18n leakage
    }
    
    // Replace placeholders if vars provided
    if (vars && Object.keys(vars).length > 0) {
      str = str.replace(/\{(\w+)\}/g, (match, k) => vars[k] !== undefined ? vars[k] : match);
    }
    return str;
  }

  // =========================
  // Emoji Mappings
  // =========================

  // Crop emoji mapping
  const CROP_EMOJI = {
    'lungroot': '🫁',
    'heartbean': '🫀',
    'brainmint': '🧠',
    'bonegrain': '🦴',
    'bloodberry': '🩸',
    'eyeseed': '👁️'
  };

  // Ground emoji mapping based on atmosphere
  const GROUND_EMOJI = {
    'dawn': '🟧',
    'day': '🟨',
    'dusk': '🟥',
    'night': '🟦',
    'anomaly': '🟪'
  };

  // Atmosphere icon mapping
  const ATMOSPHERE_ICON = {
    'dawn': '🌅',
    'day': '🌤️',
    'dusk': '🌇',
    'night': '🌙',
    'anomaly': '🛸'
  };

  // =========================
  // Core Rendering Functions
  // =========================

  // Plot to visual string (state → emoji)
  function plotToVisual(plot, globalBuffs, fieldAtmo) {
    const atmo = fieldAtmo?.current || 'day';
    const groundEmoji = GROUND_EMOJI[atmo] || '🟨';
    
    if (!plot || !plot.cropKey) {
      return groundEmoji + ' ⬛';
    }
    
    const cropEmoji = CROP_EMOJI[plot.cropKey] || '⬜';
    let stageEmoji = '🌱';
    
    if (plot.stage === 'grow') {
      stageEmoji = '🌿';
    } else if (plot.stage === 'ready') {
      // Anomaly special: ready → 💎
      if (atmo === 'anomaly' && fieldAtmo?.anomalyActive) {
        stageEmoji = '💎';
      } else {
        stageEmoji = '🍀';
      }
    }
    
    // Check wither risk (bonegrain)
    const crop = window.SUSFARM_DATA?.crops[plot.cropKey];
    if (crop && crop.special?.type === 'wither' && plot.stage === 'grow' && plot.remainingSeconds > 0) {
      stageEmoji += '🫨';
    }
    
    // Check active buffs affecting this plot
    if (globalBuffs && globalBuffs.length > 0) {
      const hasBuff = globalBuffs.some(buff => {
        // heart_surge affects growth speed
        if (buff.id === 'heart_surge') return true;
        // womb_reactor adds temp plot
        if (buff.id === 'womb_reactor') return true;
        return false;
      });
      if (hasBuff) {
        stageEmoji += '🔥';
      }
    }
    
    return groundEmoji + ' ' + cropEmoji + stageEmoji;
  }

  // Update HUD
  function updateHUD() {
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    const coin = window.SUS_WALLET?.get() || 0;
    const usedPlots = state.plots.filter(p => p && p.cropKey).length;
    const autoLevel = state.upgrades.automation || 0;
    const streak = state.streak || 0;
    
    // Next tick countdown
    const now = Date.now();
    const lastTick = state.lastTickAt || now;
    const nextTickMs = 60 * 1000 - (now - lastTick);
    const nextTickSec = Math.max(0, Math.floor(nextTickMs / 1000));
    
    // Next reward
    const nextReward = window.SUSFARM_STATE?.getNextReward();
    let rewardText = '-';
    if (nextReward) {
      rewardText = `~${formatTime(nextReward.time)} → +${nextReward.yield}💰`;
    }
    
    const hudCoin = document.getElementById('hudCoin');
    if (hudCoin) hudCoin.textContent = formatNumber(coin);
    
    const hudPlots = document.getElementById('hudPlots');
    if (hudPlots) hudPlots.textContent = `${usedPlots}/${state.maxPlots}`;
    
    const hudAuto = document.getElementById('hudAuto');
    if (hudAuto) hudAuto.textContent = `Lv${autoLevel}`;
    
    const hudStreak = document.getElementById('hudStreak');
    if (hudStreak) hudStreak.textContent = streak;
    
    const hudNextTick = document.getElementById('hudNextTick');
    if (hudNextTick) hudNextTick.textContent = formatTime(nextTickSec);
    
    const hudNextReward = document.getElementById('hudNextReward');
    if (hudNextReward) hudNextReward.textContent = rewardText;
  }

  // =========================
  // Render Functions
  // =========================

  // Render plots
  function renderPlots() {
    const container = document.getElementById('plotsContainer');
    if (!container) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    container.innerHTML = '';
    
    // Create local plots array (don't mutate state directly)
    const plots = state.plots.slice();
    while (plots.length < state.maxPlots) {
      plots.push({
        id: plots.length,
        cropKey: null,
        plantedAt: 0,
        remainingSeconds: 0,
        stage: 'empty',
        lastTickAt: 0
      });
    }
    
    plots.forEach((plot, index) => {
      const plotDiv = document.createElement('div');
      plotDiv.className = 'plot-card';
      if (plot.stage === 'ready') plotDiv.classList.add('ready');
      
      const crop = plot.cropKey ? window.SUSFARM_DATA?.crops[plot.cropKey] : null;
      
      let html = `<div class="plot-header">
        <strong>${tx('g.susfarm.plot.title')} #${plot.id + 1}</strong>
      </div>`;
      
      if (crop) {
        const cropName = tx(crop.nameKey);
        const stageKey = `g.susfarm.stage.${plot.stage}`;
        const stageName = tx(stageKey);
        
        let yieldAmount = crop.baseYield;
        const state = window.SUSFARM_STATE?.getState();
        if (state && state.buffs.yieldPercent > 0) {
          yieldAmount = Math.floor(yieldAmount * (1 + state.buffs.yieldPercent / 100));
        }
        
        html += `
          <div class="plot-info">
            <div><strong>${tx('g.susfarm.plot.crop')}:</strong> ${cropName}</div>
            <div><strong>${tx('g.susfarm.plot.stage')}:</strong> ${stageName}</div>
            <div><strong>${tx('g.susfarm.plot.time')}:</strong> ${formatTime(plot.remainingSeconds)}</div>
            <div><strong>${tx('g.susfarm.plot.yield')}:</strong> +${yieldAmount} 💰</div>
          </div>
          <div class="plot-actions">
        `;
        
        if (plot.stage !== 'ready') {
          html += `
            <button class="btn-small" onclick="window.waterPlot(${index})">${tx('g.susfarm.action.water')} 5💰</button>
            <button class="btn-small" onclick="window.boostPlot(${index})">${tx('g.susfarm.action.boost')} 20💰</button>
          `;
        }
        
        if (plot.stage === 'ready') {
          html += `<button class="btn-small btn-harvest" onclick="window.harvestPlot(${index})">${tx('g.susfarm.action.harvest')}</button>`;
        }
        
        html += `</div>`;
      } else {
        // Empty plot - show plant options
        html += `
          <div class="plot-info">
            <div>${tx('g.susfarm.plot.empty')}</div>
          </div>
          <div class="plot-actions">
            <select id="cropSelect${index}" class="crop-select">
        `;
        
        Object.values(window.SUSFARM_DATA?.crops || {}).forEach(crop => {
          const cropName = tx(crop.nameKey);
          html += `<option value="${crop.key}">${crop.emoji} ${cropName} (${crop.seedCost}💰)</option>`;
        });
        
        html += `
            </select>
            <button class="btn-small" onclick="window.plantPlot(${index})">${tx('g.susfarm.action.plant')}</button>
          </div>
        `;
      }
      
      plotDiv.innerHTML = html;
      container.appendChild(plotDiv);
    });
    
    // Re-apply i18n to dynamically rendered content
    if (window.applyLangTo) {
      window.applyLangTo(container, window.currentLang || 'en');
    }
  }

  // Render upgrades
  function renderUpgrades() {
    const container = document.getElementById('upgradeContainer');
    if (!container) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    container.innerHTML = '';
    
    Object.values(window.SUSFARM_DATA?.upgrades || {}).forEach(upgrade => {
      const currentLevel = state.upgrades[upgrade.key] || 0;
      const canUpgrade = currentLevel < upgrade.maxLevel;
      const cost = canUpgrade ? upgrade.costs[currentLevel] : null;
      const coin = window.SUS_WALLET?.get() || 0;
      const canAfford = cost && coin >= cost;
      
      const upgradeDiv = document.createElement('div');
      upgradeDiv.className = 'upgrade-card';
      
      const effect = upgrade.effect(currentLevel + 1);
      let effectText = '';
      if (effect.plots) effectText = `+${effect.plots} ${tx('g.susfarm.hud.plots')}`;
      if (effect.autoHarvest) effectText = tx('g.susfarm.upgrade.effect.autoHarvest');
      if (effect.autoReplant) effectText = tx('g.susfarm.upgrade.effect.autoReplant');
      if (effect.autoWater) effectText = tx('g.susfarm.upgrade.effect.autoWater');
      if (effect.buffDuration) effectText = `${Math.floor(effect.buffDuration / 60)}min ${tx('g.susfarm.upgrade.effect.buff')}`;
      
      upgradeDiv.innerHTML = `
        <div class="upgrade-header">
          <strong>${tx(upgrade.nameKey)}</strong>
          <span>Lv${currentLevel}/${upgrade.maxLevel}</span>
        </div>
        <div class="upgrade-info">
          ${canUpgrade ? `
            <div>${tx('g.susfarm.upgrade.cost')}: ${formatNumber(cost)}💰</div>
            <div>${tx('g.susfarm.upgrade.effect')}: ${effectText}</div>
          ` : `<div>${tx('g.susfarm.upgrade.maxed')}</div>`}
        </div>
        ${canUpgrade ? `
          <button class="btn" onclick="window.buyUpgrade('${upgrade.key}')" ${!canAfford ? 'disabled' : ''}>
            ${tx('g.susfarm.upgrade.buy')}
          </button>
        ` : ''}
      `;
      
      container.appendChild(upgradeDiv);
    });
    
    // Re-apply i18n to dynamically rendered content
    if (window.applyLangTo) {
      window.applyLangTo(container, window.currentLang || 'en');
    }
  }

  // Render rites
  function renderRites() {
    const container = document.getElementById('ritesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.values(window.SUSFARM_DATA?.rites || {}).forEach(rite => {
      const coin = window.SUS_WALLET?.get() || 0;
      const canAfford = coin >= rite.cost;
      
      const riteDiv = document.createElement('div');
      riteDiv.className = 'rite-card';
      
      riteDiv.innerHTML = `
        <div class="rite-header">
          <strong>${tx(rite.nameKey)}</strong>
        </div>
        <div class="rite-info">
          <div>${tx(rite.descKey)}</div>
          <div>${tx('g.susfarm.rite.cost')}: ${rite.cost}💰</div>
        </div>
        <button class="btn" onclick="window.activateRite('${rite.key}')" ${!canAfford ? 'disabled' : ''}>
          ${tx('g.susfarm.rite.activate')}
        </button>
      `;
      
      container.appendChild(riteDiv);
    });
    
    // Re-apply i18n to dynamically rendered content
    if (window.applyLangTo) {
      window.applyLangTo(container, window.currentLang || 'en');
    }
  }

  // Render log
  function renderLog() {
    const container = document.getElementById('logContainer');
    if (!container) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    container.innerHTML = '';
    
    if (state.log.length === 0) {
      container.innerHTML = '<p>' + tx('g.susfarm.log.empty') + '</p>';
      return;
    }
    
    state.log.forEach(entry => {
      const logDiv = document.createElement('div');
      logDiv.className = 'log-entry';
      
      const date = new Date(entry.timestamp).toLocaleTimeString();
      let text = '';
      
      switch (entry.type) {
        case 'planted':
          text = `${entry.data.crop} ${tx('g.susfarm.log.planted')} ${tx('g.susfarm.plot.title')} #${entry.data.plotId + 1}`;
          break;
        case 'harvested':
          const critText = entry.data.isCrit ? ` ${tx('g.susfarm.log.double')}!` : '';
          const autoText = entry.data.isAuto ? ' [AUTO]' : '';
          text = `${entry.data.crop} ${tx('g.susfarm.log.harvested')} +${entry.data.yield}💰${critText}${autoText}`;
          break;
        case 'withered':
          text = `${entry.data.crop} ${tx('g.susfarm.log.withered')} ${tx('g.susfarm.plot.title')} #${entry.data.plotId + 1}`;
          break;
        case 'blessed':
          text = `✨ ${tx('g.susfarm.log.blessed')}`;
          break;
        case 'anomaly_start':
          text = `🛸 ${tx('g.susfarm.log.anomaly_start')}`;
          break;
        default:
          text = JSON.stringify(entry.data);
      }
      
      logDiv.textContent = `[${date}] ${text}`;
      container.appendChild(logDiv);
    });
    
    // Re-apply i18n to dynamically rendered content
    if (window.applyLangTo) {
      window.applyLangTo(container, window.currentLang || 'en');
    }
  }

  // Render market
  function renderMarket() {
    const container = document.getElementById('tabMarket');
    if (!container) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    container.innerHTML = '';
    
    // Market HUD
    const marketHud = document.createElement('div');
    marketHud.className = 'susfarm-hud';
    marketHud.innerHTML = `
      <div class="hud-item">
        <span>🏪</span>
        <span data-i18n="g.susfarm.market.title">Market</span>
      </div>
      <div class="hud-item">
        <span>📦</span>
        <span data-i18n="g.susfarm.market.hud.goods">Goods</span>: <span id="marketGoodsCount">0</span>
      </div>
      <div class="hud-item">
        <span>📈</span>
        <span data-i18n="g.susfarm.market.hud.volatility">Volatility</span>: <span id="marketVolatility">-</span>
      </div>
      <div class="hud-item">
        <span>⏳</span>
        <span data-i18n="g.susfarm.market.hud.refresh">Price refresh</span>: <span id="marketRefresh">00:00</span>
      </div>
      <div class="hud-item">
        <span>🧭</span>
        <span data-i18n="g.susfarm.market.hud.mood">Mood</span>: <span id="marketMood">-</span>
      </div>
      <div class="hud-item">
        <span>🗞️</span>
        <span data-i18n="g.susfarm.market.hud.event">Event</span>: <span id="marketEvent">-</span>
      </div>
    `;
    container.appendChild(marketHud);
    
    // Update HUD values
    const totalGoods = Object.values(state.inventory || {}).reduce((a, b) => a + b, 0);
    // Use i18n keys for volatility instead of hardcoded English
    const volatilityKey = state.market.mood === 'hot' || state.market.mood === 'panic' ? 'g.susfarm.market.volatility.high' : 
                          state.market.mood === 'calm' ? 'g.susfarm.market.volatility.low' : 'g.susfarm.market.volatility.medium';
    const now = Date.now();
    const nextRefresh = MARKET_REFRESH_INTERVAL - (now % MARKET_REFRESH_INTERVAL);
    const moodKey = `g.susfarm.market.mood.${state.market.mood || 'calm'}`;
    const event = state.market.activeEvent;
    const eventText = event ? tx(event.headlineKey) : tx('g.susfarm.market.hud.event_none');
    
    document.getElementById('marketGoodsCount').textContent = totalGoods;
    const volatilityText = tx(volatilityKey);
    if (volatilityText) document.getElementById('marketVolatility').textContent = volatilityText;
    document.getElementById('marketRefresh').textContent = formatTime(Math.floor(nextRefresh / 1000));
    const moodText = tx(moodKey);
    if (moodText) document.getElementById('marketMood').textContent = moodText;
    if (eventText) document.getElementById('marketEvent').textContent = eventText;
    
    // Goods list
    const goodsList = document.createElement('div');
    goodsList.className = 'market-goods-list';
    
    const goods = window.SUSFARM_DATA?.goods || {};
    Object.keys(goods).forEach(key => {
      const good = goods[key];
      const owned = state.inventory[key] || 0;
      const price = state.market.prices[key] || good.basePrice;
      const lastPrice = state.market.lastPrices[key] || price;
      const change = lastPrice > 0 ? ((price - lastPrice) / lastPrice * 100).toFixed(0) : 0;
      const changeText = change > 0 ? `(▲ +${change}%)` : change < 0 ? `(▼ ${change}%)` : '';
      const isRare = good.rarity === 'rare' || good.rarity === 'legendary';
      
      const goodDiv = document.createElement('div');
      goodDiv.className = 'market-good-card';
      
      goodDiv.innerHTML = `
        <div class="good-header">
          <strong>${good.emoji} ${tx(good.nameKey)}</strong>
          ${isRare ? '<span class="rare-badge">RARE</span>' : ''}
        </div>
        <div class="good-info">
          <div><strong>${tx('g.susfarm.market.owned')}:</strong> ${owned}</div>
          <div><strong>${tx('g.susfarm.market.price')}:</strong> ${price} 💰 ${changeText}</div>
          ${good.edible ? `<div><strong>${tx('g.susfarm.consume.title')}:</strong> ${tx('g.susfarm.consume.cta')}</div>` : ''}
        </div>
        <div class="good-actions" data-good-key="${key}">
          ${owned > 0 ? `
            ${good.basePrice > 0 ? `
              <button class="btn-small" data-action="sell" data-count="1">${tx('g.susfarm.market.action.sell_one')}</button>
              <button class="btn-small" data-action="sell" data-count="${owned}">${tx('g.susfarm.market.action.sell_all')}</button>
            ` : ''}
            ${good.edible ? `<button class="btn-small" data-action="consume" data-count="1">${tx('g.susfarm.consume.cta')}</button>` : ''}
          ` : '<div class="good-empty">' + tx('g.susfarm.market.no_goods') + '</div>'}
        </div>
      `;
      
      goodsList.appendChild(goodDiv);
      
      // Add event listeners for buttons (CSP-safe, no inline onclick)
      const actionsDiv = goodDiv.querySelector('.good-actions');
      if (actionsDiv && owned > 0) {
        const buttons = actionsDiv.querySelectorAll('button[data-action]');
        buttons.forEach(btn => {
          btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const count = parseInt(btn.getAttribute('data-count') || '1', 10);
            const goodKey = actionsDiv.getAttribute('data-good-key');
            
            if (action === 'sell' && window.sellGoods && goodKey) {
              window.sellGoods(goodKey, count);
            } else if (action === 'consume' && window.consumeGoods && goodKey) {
              window.consumeGoods(goodKey, count);
            }
          });
        });
      }
    });
    
    container.appendChild(goodsList);
    
    // Market log
    const logDiv = document.createElement('div');
    logDiv.className = 'market-log';
    logDiv.innerHTML = '<h4>' + tx('g.susfarm.market.log.title') + '</h4>';
    const logContainer = document.createElement('div');
    logContainer.className = 'log-container';
    
    if (state.market.log.length === 0) {
      logContainer.innerHTML = '<p>' + tx('g.susfarm.market.log.empty') + '</p>';
    } else {
      state.market.log.forEach(entry => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        const date = new Date(entry.timestamp).toLocaleTimeString();
        let text = '';
        
        switch (entry.type) {
          case 'sold':
            text = `${tx('g.susfarm.market.log.sold')} ${entry.data.count} × ${tx(window.SUSFARM_DATA?.goods[entry.data.good]?.nameKey || '')} for ${entry.data.profit} 💰`;
            break;
          case 'event':
            // entry.data.event is an event ID like 'surge', 'crash', 'freeze', etc.
            const eventId = entry.data.event || '';
            const eventDef = window.SUSFARM_DATA?.marketEvents?.[eventId];
            if (eventDef && eventDef.headlineKey) {
              // Use the event's headline key for translation
              text = tx(eventDef.headlineKey);
            } else {
              // Fallback: try log key format, otherwise use event ID
              const eventLogKey = `g.susfarm.market.log.${eventId}`;
              const eventLogText = tx(eventLogKey);
              text = eventLogText !== eventLogKey ? eventLogText : eventId;
            }
            break;
          case 'insider_boost':
          case 'insider_taunt':
            const goodName = entry.data.good ? tx(window.SUSFARM_DATA?.goods[entry.data.good]?.nameKey || '') : '';
            text = `${tx('g.susfarm.market.log.insider')}: ${goodName}`;
            break;
          case 'anomaly':
            // entry.data.id is an anomaly ID like 'blessing_overflow', 'corruption_bloom', etc.
            const anomalyId = entry.data.id || '';
            const anomalyKey = `g.susfarm.anomaly.${anomalyId}.headline`;
            text = `${tx('g.susfarm.market.log.anomaly')}: ${tx(anomalyKey) || anomalyId}`;
            break;
          default:
            text = JSON.stringify(entry.data);
        }
        
        logEntry.textContent = `[${date}] ${text}`;
        logContainer.appendChild(logEntry);
      });
    }
    
    logDiv.appendChild(logContainer);
    container.appendChild(logDiv);
    
    // Re-apply i18n to dynamically rendered content (including data-i18n attributes)
    if (window.applyLangTo) {
      window.applyLangTo(container, window.currentLang || 'en');
    } else {
      console.error('[renderMarket] window.applyLangTo is not available!');
    }
  }

  // Render consume (placeholder - to be implemented)
  function renderConsume() {
    const container = document.getElementById('tabConsume');
    if (!container) return;
    container.innerHTML = '<p>' + tx('g.susfarm.consume.title') + ' - Coming soon...</p>';
  }

  // Render field grid
  function renderFieldGrid() {
    const container = document.getElementById('fieldGrid');
    if (!container) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state) return;
    
    container.innerHTML = '';
    
    // Calculate grid dimensions (3 columns, expand with plots)
    const cols = 3;
    const rows = Math.ceil(state.maxPlots / cols);
    
    // Ensure plots array is large enough
    while (state.plots.length < state.maxPlots) {
      state.plots.push({
        id: state.plots.length,
        cropKey: null,
        plantedAt: 0,
        remainingSeconds: 0,
        stage: 'empty',
        lastTickAt: 0
      });
    }
    
    // Get global buffs
    const globalBuffs = state.player?.buffs || [];
    const fieldAtmo = state.fieldAtmo || { current: 'day', anomalyActive: false };
    
    // Render grid
    for (let i = 0; i < state.maxPlots; i++) {
      const plot = state.plots[i] || {
        id: i,
        cropKey: null,
        stage: 'empty'
      };
      
      const visual = plotToVisual(plot, globalBuffs, fieldAtmo);
      const plotId = String(i + 1).padStart(2, '0');
      
      const cell = document.createElement('div');
      cell.className = 'field-cell';
      if (plot.stage === 'ready') cell.classList.add('ready');
      if (plot.cropKey) cell.classList.add('occupied');
      
      cell.innerHTML = `<span class="field-plot-id">[${plotId}]</span> <span class="field-plot-visual">${visual}</span>`;
      cell.onclick = () => openPlotInspector(i);
      
      container.appendChild(cell);
    }
    
    // Update field header
    const seasonEl = document.getElementById('fieldSeason');
    const atmoEl = document.getElementById('fieldAtmo');
    if (seasonEl || atmoEl) {
      const mood = state.market?.mood || 'calm';
      const moodKey = `g.susfarm.market.mood.${mood}`;
      if (seasonEl) seasonEl.textContent = tx(moodKey);
      
      // Atmosphere display
      if (atmoEl) {
        const atmo = state.fieldAtmo?.current || 'day';
        const atmoActive = state.fieldAtmo?.anomalyActive || false;
        const icon = ATMOSPHERE_ICON[atmo] || '🌤️';
        const atmoKey = `g.susfarm.field.atmo.${atmo}`;
        const atmoLabel = tx(atmoKey);
        atmoEl.innerHTML = `${icon} <strong>${atmoLabel}</strong>`;
      }
    }
    
    const tickEl = document.getElementById('fieldTick');
    if (tickEl) {
      const now = Date.now();
      const lastTick = state.lastTickAt || now;
      const nextTickMs = 60 * 1000 - (now - lastTick);
      const nextTickSec = Math.max(0, Math.floor(nextTickMs / 1000));
      tickEl.textContent = formatTime(nextTickSec);
    }
  }

  // Open plot inspector
  function openPlotInspector(plotIndex) {
    const inspector = document.getElementById('plotInspector');
    const content = document.getElementById('inspectorContent');
    const title = document.getElementById('inspectorTitle');
    
    if (!inspector || !content || !title) return;
    
    const state = window.SUSFARM_STATE?.getState();
    if (!state || plotIndex < 0 || plotIndex >= state.plots.length) return;
    
    const plot = state.plots[plotIndex];
    if (!plot) return;
    
    title.textContent = `${tx('g.susfarm.plot.inspector.title')} #${plotIndex + 1}`;
    
    if (!plot.cropKey) {
      content.innerHTML = `
        <div class="inspector-info">
          <div>${tx('g.susfarm.plot.inspector.empty')}</div>
        </div>
        <div class="inspector-actions">
          <select id="inspectorCropSelect" class="crop-select">
      `;
      
      Object.values(window.SUSFARM_DATA?.crops || {}).forEach(crop => {
        const cropName = tx(crop.nameKey);
        content.querySelector('#inspectorCropSelect').innerHTML += 
          `<option value="${crop.key}">${crop.emoji} ${cropName} (${crop.seedCost}💰)</option>`;
      });
      
      content.innerHTML += `
          </select>
          <button class="btn" onclick="window.plantPlotFromInspector(${plotIndex})">${tx('g.susfarm.action.plant')}</button>
        </div>
      `;
    } else {
      const crop = window.SUSFARM_DATA?.crops[plot.cropKey];
      if (!crop) return;
      
      const cropName = tx(crop.nameKey);
      const stageKey = `g.susfarm.stage.${plot.stage}`;
      const stageName = tx(stageKey);
      
      let yieldAmount = crop.baseYield;
      if (state.buffs.yieldPercent > 0) {
        yieldAmount = Math.floor(yieldAmount * (1 + state.buffs.yieldPercent / 100));
      }
      
      // Check active buffs
      const activeBuffs = (state.player?.buffs || []).filter(b => {
        const now = Date.now();
        return now < b.endsAt;
      });
      
      let buffsText = '';
      if (activeBuffs.length > 0) {
        buffsText = activeBuffs.map(b => {
          const buffDef = window.SUSFARM_DATA?.buffs[b.id];
          if (buffDef) {
            return `${tx(buffDef.nameKey)} (${b.stacks}x)`;
          }
          return '';
        }).filter(Boolean).join(', ');
      } else {
        buffsText = tx('g.susfarm.plot.inspector.no_buffs');
      }
      
      content.innerHTML = `
        <div class="inspector-info">
          <div><strong>${crop.emoji} ${cropName}</strong></div>
          <div><strong>${tx('g.susfarm.plot.stage')}:</strong> ${stageName}</div>
          <div><strong>${tx('g.susfarm.plot.time')}:</strong> ${formatTime(plot.remainingSeconds)}</div>
          <div><strong>${tx('g.susfarm.plot.yield')}:</strong> +${yieldAmount} 💰</div>
          <div><strong>${tx('g.susfarm.plot.inspector.buffs')}:</strong> ${buffsText}</div>
        </div>
        <div class="inspector-actions">
      `;
      
      if (plot.stage !== 'ready') {
        content.innerHTML += `
          <button class="btn-small" onclick="window.waterPlot(${plotIndex}); window.closePlotInspector();">${tx('g.susfarm.action.water')} 5💰</button>
          <button class="btn-small" onclick="window.boostPlot(${plotIndex}); window.closePlotInspector();">${tx('g.susfarm.action.boost')} 20💰</button>
        `;
      }
      
      if (plot.stage === 'ready') {
        content.innerHTML += `
          <button class="btn-small btn-harvest" onclick="window.harvestPlot(${plotIndex}); window.closePlotInspector();">${tx('g.susfarm.action.harvest')}</button>
        `;
      }
      
      content.innerHTML += `</div>`;
    }
    
    inspector.style.display = 'block';
  }

  // =========================
  // Tab Management
  // =========================

  // Update all UI
  function updateSusFarmUI() {
    // Always update HUD first to sync money
    updateHUD();
    renderFieldGrid(); // Always render field grid
    
    if (currentTab === 'plots') renderPlots();
    else if (currentTab === 'upgrade') renderUpgrades();
    else if (currentTab === 'market') renderMarket();
    else if (currentTab === 'consume') renderConsume();
    else if (currentTab === 'rites') renderRites();
    else if (currentTab === 'log') renderLog();
  }

  // Tab switching
  function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tab) btn.classList.add('active');
    });
    
    // Update tab content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    
    // Show the selected tab content
    const tabIdMap = {
      'plots': 'tabPlots',
      'upgrade': 'tabUpgrade',
      'market': 'tabMarket',
      'rites': 'tabRites',
      'log': 'tabLog'
    };
    
    const targetContent = document.getElementById(tabIdMap[tab]);
    if (targetContent) {
      targetContent.classList.add('active');
    }
    
    // Update UI to render the selected tab content
    updateSusFarmUI();
  }

  // =========================
  // Window Export Functions
  // =========================

  // Close plot inspector
  window.closePlotInspector = function() {
    const inspector = document.getElementById('plotInspector');
    if (inspector) {
      inspector.style.display = 'none';
    }
  };

  // Plant from inspector
  window.plantPlotFromInspector = function(plotIndex) {
    const select = document.getElementById('inspectorCropSelect');
    if (!select) {
      console.error('Inspector crop select not found');
      return;
    }
    const cropKey = select.value;
    if (!cropKey) {
      console.error('No crop selected in inspector');
      return;
    }
    
    // Check wallet first
    const crop = window.SUSFARM_DATA?.crops[cropKey];
    if (!crop) {
      console.error('Crop not found:', cropKey);
      return;
    }
    
    const wallet = window.SUS_WALLET?.get() || 0;
    if (wallet < crop.seedCost) {
      alert(`Not enough coins. Need ${crop.seedCost}💰, have ${wallet}💰`);
      updateHUD(); // Update to show current balance
      return;
    }
    
    if (window.SUSFARM_STATE?.plantCrop(plotIndex, cropKey)) {
      window.closePlotInspector();
      updateSusFarmUI();
    } else {
      alert('Failed to plant. Check if you have enough coins.');
      updateHUD(); // Update to show current balance
    }
  };

  // Action handlers
  window.plantPlot = function(plotIndex) {
    const select = document.getElementById(`cropSelect${plotIndex}`);
    if (!select) {
      console.error('Crop select not found for plot', plotIndex);
      return;
    }
    const cropKey = select.value;
    if (!cropKey) {
      console.error('No crop selected');
      return;
    }
    
    // Check wallet first
    const crop = window.SUSFARM_DATA?.crops[cropKey];
    if (!crop) {
      console.error('Crop not found:', cropKey);
      return;
    }
    
    const wallet = window.SUS_WALLET?.get() || 0;
    if (wallet < crop.seedCost) {
      alert(`Not enough coins. Need ${crop.seedCost}💰, have ${wallet}💰`);
      updateHUD(); // Update to show current balance
      return;
    }
    
    if (window.SUSFARM_STATE?.plantCrop(plotIndex, cropKey)) {
      updateSusFarmUI();
    } else {
      alert('Failed to plant. Check if you have enough coins.');
      updateHUD(); // Update to show current balance
    }
  };

  window.waterPlot = function(plotIndex) {
    const wallet = window.SUS_WALLET?.get() || 0;
    if (wallet < 5) {
      alert(`Not enough coins. Need 5💰, have ${wallet}💰`);
      updateHUD();
      return;
    }
    if (window.SUSFARM_STATE?.waterPlot(plotIndex)) {
      updateSusFarmUI();
    } else {
      alert('Failed to water. Check if you have enough coins.');
      updateHUD();
    }
  };

  window.boostPlot = function(plotIndex) {
    const wallet = window.SUS_WALLET?.get() || 0;
    if (wallet < 20) {
      alert(`Not enough coins. Need 20💰, have ${wallet}💰`);
      updateHUD();
      return;
    }
    if (window.SUSFARM_STATE?.boostPlot(plotIndex)) {
      updateSusFarmUI();
    } else {
      alert('Failed to boost. Check if you have enough coins.');
      updateHUD();
    }
  };

  window.harvestPlot = function(plotIndex) {
    if (window.SUSFARM_STATE?.harvestPlot(plotIndex)) {
      updateSusFarmUI();
    }
  };

  window.buyUpgrade = function(upgradeKey) {
    if (window.SUSFARM_STATE?.buyUpgrade(upgradeKey)) {
      updateSusFarmUI();
    } else {
      alert('Failed to buy upgrade. Check if you have enough coins.');
    }
  };

  window.activateRite = function(riteKey) {
    if (window.SUSFARM_STATE?.activateRite(riteKey)) {
      // Trigger ritual echo
      window.SUSFARM_STATE?.triggerRitualEcho();
      updateSusFarmUI();
    } else {
      alert('Failed to activate rite. Check if you have enough coins.');
    }
  };

  window.sellGoods = function(goodsKey, count) {
    if (window.SUSFARM_STATE?.sellGoods(goodsKey, count)) {
      updateSusFarmUI();
    } else {
      alert('Failed to sell goods.');
    }
  };

  window.consumeGoods = function(goodsKey, count) {
    if (window.SUSFARM_STATE?.consumeGoods(goodsKey, count)) {
      updateSusFarmUI();
    } else {
      alert('Failed to consume. Check cooldown or inventory.');
    }
  };

  // Dev tools
  window.SUSFARM_DEV = {
    addCoin: (amount) => {
      window.SUS_WALLET?.add(amount);
      updateSusFarmUI();
    },
    fastForward: (seconds) => {
      const state = window.SUSFARM_STATE?.getState();
      if (state) {
        state.plots.forEach(plot => {
          if (plot.cropKey && plot.remainingSeconds > 0) {
            plot.remainingSeconds = Math.max(0, plot.remainingSeconds - seconds);
          }
        });
        window.SUSFARM_STATE?.saveState();
        updateSusFarmUI();
      }
    },
    reset: () => {
      if (confirm('Reset all farm state?')) {
        localStorage.removeItem('susfarm.state.v1');
        location.reload();
      }
    }
  };

  // Export main functions for external access
  window.updateSusFarmUI = updateSusFarmUI;
  window.switchTab = switchTab;

  // =========================
  // Initialization (Guard against double init)
  // =========================

  if (!window.__SUSFARM_UI_INITIALIZED__) {
    window.__SUSFARM_UI_INITIALIZED__ = true;

    // Use event delegation for tab clicks (most robust)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;

      // Prevent default if it's a link
      e.preventDefault();

      const tab = btn.getAttribute('data-tab');
      if (!tab) return;

      switchTab(tab);
    });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function init() {
      // Wallet change listener - update HUD immediately
      window.addEventListener('walletChanged', () => {
        updateHUD(); // Update HUD immediately for money sync
        updateSusFarmUI(); // Then update full UI
      });
      
      // Also update HUD periodically to catch any wallet changes
      setInterval(() => {
        updateHUD();
      }, 500); // Update every 500ms for better responsiveness
      
      // Language change listener
      window.addEventListener('langChanged', () => {
        updateSusFarmUI();
      });
      
      // Initial render
      updateSusFarmUI();
      
      // Update HUD and field grid every second for countdown
      setInterval(() => {
        updateHUD();
        renderFieldGrid(); // Update field grid countdown
        if (currentTab === 'market') {
          const state = window.SUSFARM_STATE?.getState();
          if (state) {
            const now = Date.now();
            const nextRefresh = MARKET_REFRESH_INTERVAL - (now % MARKET_REFRESH_INTERVAL);
            const refreshEl = document.getElementById('marketRefresh');
            if (refreshEl) refreshEl.textContent = formatTime(Math.floor(nextRefresh / 1000));
            
            const event = state.market.activeEvent;
            if (event) {
              const remaining = Math.max(0, event.endsAt - now);
              const eventEl = document.getElementById('marketEvent');
              if (eventEl) {
                eventEl.textContent = `${tx(event.headlineKey)} (${formatTime(Math.floor(remaining / 1000))})`;
              }
            }
          }
        }
      }, 1000);
    }
  }
})();
