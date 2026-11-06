<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { SettingsStore, Theme } from '../config/settings';
  import { defaults } from '../config/settings';
  import type { GainController } from '../features/volume-gain/controller';
  import type { Readable } from '../core/state';
  import FishIcon from './FishIcon.svelte';
  import AccentPicker from './AccentPicker.svelte';
  import { accentText } from './theme';
  import { version } from '../core/version';
  import type { PageTools } from '../features/page-tools/controller';
  import type { SettingsSection } from './settings-types';
  import OptimizationSettings from './OptimizationSettings.svelte';
  import BarrageSettings from './BarrageSettings.svelte';
  import { animateContent } from './motion';
  import type { TeamController } from '../features/team-live/controller';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  import TeamSettings from './TeamSettings.svelte';
  import MultiSettings from './MultiSettings.svelte';
  import MenuSettings from './MenuSettings.svelte';
  import { showModal } from './modal';
  import SignSettings from './SignSettings.svelte';
  import type { SignController } from '../features/sign/feature';
  import PlaybackSettings from './PlaybackSettings.svelte';
  import RoomSettings from './RoomSettings.svelte';
  import BackpackSettings from './BackpackSettings.svelte';
  import type { BackpackController } from '../features/backpack/controller';
  import type { PlaybackController } from '../features/playback/controller';
  import type { RoomPageController } from '../features/room-page/controller';

  let { settings, gain, pageTheme, tools, team, multi, sign, backpack, playback, roomPage, openTeam }: { settings: SettingsStore; gain: GainController; pageTheme: Readable<'light' | 'dark'>; tools: PageTools; team: TeamController; multi: MultiscreenController; sign: SignController; backpack: BackpackController; playback: PlaybackController; roomPage: RoomPageController; openTeam: () => void } = $props();
  let dialog: HTMLDialogElement;
  let section = $state<SettingsSection>('general');
  const initial = untrack(() => ({ ...settings.value }));
  let saved = $state(initial);
  let theme = $state<Theme>(initial.theme);
  let accentColor = $state(initial.accentColor);
  let maxMultiplier = $state<number | undefined>(initial.maxMultiplier);
  let gainPresets = $state([...initial.gainPresets]);
  let presetExtra = $state<number | undefined>(undefined);
  let optimization = $state({ ...initial.optimization });
  let nativeShield = $state({ ...initial.nativeShield });
  let barrage = $state({ ...initial.barrage });
  let teamOptions = $state({ ...initial.team });
  let multiOptions = $state({ ...initial.multi, custom: [...initial.multi.custom] });
  let playerMenu = $state([...initial.playerMenu]);
  let signOptions = $state({ ...initial.sign });
  let playbackOptions = $state({ ...initial.playback });
  let roomOptions = $state({ ...initial.room });
  let backpackOptions = $state({ ...initial.backpack });
  let sound = $state(untrack(() => gain.value));
  let detectedTheme = $state<'light' | 'dark'>('light');
  let confirming = $state(false);
  let opened = $state(false);
  let backdropDown = false;
  let error = $state('');
  let outsideChange = $state(false);
  const generalDirty = $derived(theme !== saved.theme || accentColor !== saved.accentColor);
  const soundDirty = $derived(maxMultiplier !== saved.maxMultiplier || JSON.stringify(gainPresets) !== JSON.stringify(saved.gainPresets));
  const optimizationDirty = $derived(JSON.stringify(optimization) !== JSON.stringify(saved.optimization)
    || JSON.stringify(nativeShield) !== JSON.stringify(saved.nativeShield));
  const barrageDirty = $derived(JSON.stringify(barrage) !== JSON.stringify(saved.barrage));
  const teamDirty = $derived(JSON.stringify(teamOptions) !== JSON.stringify(saved.team));
  const multiDirty = $derived(JSON.stringify(multiOptions) !== JSON.stringify(saved.multi));
  const menuDirty = $derived(JSON.stringify(playerMenu) !== JSON.stringify(saved.playerMenu));
  const signDirty = $derived(JSON.stringify(signOptions) !== JSON.stringify(saved.sign));
  const playbackDirty = $derived(JSON.stringify(playbackOptions) !== JSON.stringify(saved.playback));
  const roomDirty = $derived(JSON.stringify(roomOptions) !== JSON.stringify(saved.room));
  const backpackDirty = $derived(JSON.stringify(backpackOptions) !== JSON.stringify(saved.backpack));
  const dirtyCount = $derived(Number(playbackDirty) + Number(roomDirty) + Number(backpackDirty) + Number(signDirty) + Number(teamDirty) + Number(multiDirty) + Number(menuDirty) + Number(generalDirty) + Number(soundDirty) + Number(optimizationDirty) + Number(barrageDirty));
  const resolvedTheme = $derived(theme === 'page' ? detectedTheme : theme);

  $effect(() => {
    const draft = opened && !outsideChange ? $state.snapshot({ theme, accentColor, optimization, nativeShield,
      barrage: { fans: barrage.fans, diamond: barrage.diamond, noble: barrage.noble, level: barrage.level,
        other: barrage.other, suffix: barrage.suffix, enter: barrage.enter },
      team: { showToolbar: teamOptions.showToolbar, columns: teamOptions.columns, teamColumns: teamOptions.teamColumns,
        alignment: teamOptions.alignment, originalWidth: teamOptions.originalWidth } }) : null;
    untrack(() => settings.preview(draft));
  });

  function finish() {
    opened = false;
    settings.preview(null);
    dialog.close();
  }

  function outside(event: MouseEvent) {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom);
  }

  function backdrop(event: MouseEvent) {
    if (backdropDown && outside(event) && !confirming) close();
    backdropDown = false;
  }

  function reset() {
    saved = { ...settings.value };
    theme = saved.theme;
    accentColor = saved.accentColor;
    maxMultiplier = saved.maxMultiplier;
    gainPresets = [...saved.gainPresets];
    optimization = { ...saved.optimization }; barrage = { ...saved.barrage };
    nativeShield = { ...saved.nativeShield };
    teamOptions = { ...saved.team }; multiOptions = { ...saved.multi, custom: [...saved.multi.custom] }; playerMenu = [...saved.playerMenu];
    signOptions = { ...saved.sign };
    playbackOptions = { ...saved.playback }; roomOptions = { ...saved.room }; backpackOptions = { ...saved.backpack };
    presetExtra = undefined;
    error = settings.error;
    outsideChange = false;
  }

  export function show(target?: SettingsSection) {
    if (target) section = target;
    if (dialog.open) { showModal(dialog); return; }
    reset(); confirming = false; opened = true;
    showModal(dialog);
  }

  function save() {
    if (maxMultiplier === undefined || !Number.isFinite(maxMultiplier) || maxMultiplier < 1 || maxMultiplier > 5) {
      error = '最大倍率应为 1.0～5.0 倍'; section = 'sound'; return;
    }
    if (outsideChange) {
      error = '设置已在其他页面更新，请放弃本次草稿后重新编辑'; return;
    }
    try {
      settings.save({ ...settings.value, theme, accentColor, maxMultiplier, gainPresets: [...gainPresets],
        optimization: { ...optimization }, barrage: { ...barrage }, nativeShield: { ...nativeShield }, team: { ...teamOptions }, multi: { ...multiOptions, custom: [...multiOptions.custom] }, playerMenu: [...playerMenu], sign: { ...signOptions },
        playback: { ...playbackOptions }, room: { ...roomOptions }, backpack: { ...backpackOptions } });
      reset();
      finish();
    } catch (cause) { error = `保存失败：${String(cause)}`; }
  }

  function close() {
    if (dirtyCount) { confirming = true; return; }
    finish();
  }

  function addPreset() {
    if (presetExtra === undefined || !Number.isInteger(presetExtra) || presetExtra < 0 || presetExtra > 400) {
      error = '请输入 0～400 的整数，表示额外增益百分比'; return;
    }
    if (gainPresets.length >= 8) { error = '最多添加 8 个常用档位'; return; }
    if (gainPresets.includes(presetExtra)) { error = '这个档位已经存在'; return; }
    gainPresets = [...gainPresets, presetExtra].sort((a, b) => a - b);
    presetExtra = undefined; error = '';
  }

  function cancel(event: Event) {
    event.preventDefault();
    if (confirming) confirming = false;
    else close();
  }

  function leave(event: BeforeUnloadEvent) {
    if (!opened || !dirtyCount) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onMount(() => {
    const stopSettings = settings.subscribe(value => {
      if (JSON.stringify(value) === JSON.stringify(saved)) return;
      if (dirtyCount) outsideChange = true;
      else { saved = { ...value }; theme = value.theme; accentColor = value.accentColor; maxMultiplier = value.maxMultiplier; gainPresets = [...value.gainPresets]; optimization = { ...value.optimization }; barrage = { ...value.barrage }; nativeShield = { ...value.nativeShield }; teamOptions = { ...value.team }; multiOptions = { ...value.multi, custom: [...value.multi.custom] }; playerMenu = [...value.playerMenu]; signOptions = { ...value.sign }; playbackOptions = { ...value.playback }; roomOptions = { ...value.room }; backpackOptions = { ...value.backpack }; }
    });
    const stopGain = gain.subscribe(value => { sound = value; });
    const stopTheme = pageTheme.subscribe(value => { detectedTheme = value; });
    return () => { stopSettings(); stopGain(); stopTheme(); settings.preview(null); };
  });
</script>

<svelte:window onbeforeunload={leave} />

<dialog bind:this={dialog} class="settings-window guanyu-themed" oncancel={cancel} onclose={() => { if (!dialog.open) { opened = false; settings.preview(null); } }} onpointerdown={event => { backdropDown = outside(event); }} onclick={backdrop} aria-labelledby="guanyu-title" data-theme={resolvedTheme} style:--guanyu-accent={accentColor} style:--guanyu-on-accent={accentText(accentColor)}>
  <header class="window-header" inert={confirming}>
    <div class="brand"><FishIcon class="brand-icon" /><strong>观鱼</strong><span class="header-divider"></span><span id="guanyu-title">设置</span></div>
    <button class="icon-button close" aria-label="关闭设置" onclick={close}>×</button>
  </header>

  <div class="window-body" inert={confirming}>
    <nav aria-label="设置分类">
      <div class="nav-items">
        <button class:current={section === 'general'} aria-current={section === 'general' ? 'page' : undefined} onclick={() => { section = 'general'; }}>
          <span aria-hidden="true">⚙</span><span>通用</span>{#if generalDirty}<small>未保存</small>{/if}
        </button>
        <button class:current={section === 'sound'} aria-current={section === 'sound' ? 'page' : undefined} onclick={() => { section = 'sound'; }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" /></svg>
          <span>声音</span>{#if soundDirty}<small>未保存</small>{/if}
        </button>
        <button class:current={section === 'optimization'} aria-current={section === 'optimization' ? 'page' : undefined} onclick={() => { section = 'optimization'; }}><span aria-hidden="true">☷</span><span>优化</span>{#if optimizationDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'playback'} aria-current={section === 'playback' ? 'page' : undefined} onclick={() => { section = 'playback'; }}><span aria-hidden="true">▷</span><span>播放</span>{#if playbackDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'room'} aria-current={section === 'room' ? 'page' : undefined} onclick={() => { section = 'room'; }}><span aria-hidden="true">⌂</span><span>房间页面</span>{#if roomDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'backpack'} aria-current={section === 'backpack' ? 'page' : undefined} onclick={() => { section = 'backpack'; }}><span aria-hidden="true">▣</span><span>背包增强</span>{#if backpackDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'barrage'} aria-current={section === 'barrage' ? 'page' : undefined} onclick={() => { section = 'barrage'; }}><span aria-hidden="true">☰</span><span>弹幕</span>{#if barrageDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'team'} aria-current={section === 'team' ? 'page' : undefined} onclick={() => { section = 'team'; }}><span aria-hidden="true">♧</span><span>团播</span>{#if teamDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'multi'} aria-current={section === 'multi' ? 'page' : undefined} onclick={() => { section = 'multi'; }}><span aria-hidden="true">▦</span><span>多屏</span>{#if multiDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'menu'} aria-current={section === 'menu' ? 'page' : undefined} onclick={() => { section = 'menu'; }}><span aria-hidden="true">☰</span><span>右键菜单</span>{#if menuDirty}<small>未保存</small>{/if}</button>
        <button class:current={section === 'sign'} aria-current={section === 'sign' ? 'page' : undefined} onclick={() => { section = 'sign'; }}><span aria-hidden="true">✓</span><span>签到与任务</span>{#if signDirty}<small>未保存</small>{/if}</button>
      </div>
      <p class="nav-version">观鱼 {version}</p>
    </nav>

    <main class="settings-content" use:animateContent={section}>
      {#if section === 'general'}
        <h1>通用</h1>
        <p class="intro">让观鱼适应你的看播习惯。</p>
        <section>
          <h2>外观</h2>
          <label class="setting-row" for="guanyu-theme"><span>主题</span>
            <select id="guanyu-theme" bind:value={theme}>
              <option value="page">跟随页面</option><option value="light">浅色</option><option value="dark">深色</option>
            </select>
          </label>
          <p class="help">立即预览；跟随页面时使用斗鱼官方的深浅色模式，放弃更改后恢复。</p>
          <AccentPicker bind:value={accentColor} />
          <p class="help">立即预览观鱼界面主题色，保存后保留。</p>
        </section>
      {:else if section === 'optimization'}
        <OptimizationSettings bind:value={optimization} bind:shield={nativeShield} {tools} />
      {:else if section === 'playback'}
        <PlaybackSettings bind:value={playbackOptions} {playback} />
      {:else if section === 'room'}
        <RoomSettings bind:value={roomOptions} {roomPage} />
      {:else if section === 'backpack'}
        <BackpackSettings bind:value={backpackOptions} {backpack} />
      {:else if section === 'barrage'}
        <BarrageSettings bind:value={barrage} />
      {:else if section === 'team'}
        <TeamSettings bind:value={teamOptions} {team} openEditor={openTeam} roomId={sound.roomId || ''} />
      {:else if section === 'multi'}
        <MultiSettings bind:value={multiOptions} {multi} onNavigate={close} />
      {:else if section === 'menu'}
        <MenuSettings bind:value={playerMenu} />
      {:else if section === 'sign'}
        <SignSettings bind:value={signOptions} {sign} />
      {:else}
        <h1>声音</h1>
        <p class="intro">按房间记住额外增益，保留原生音量。</p>
        <section>
          <h2>增益上限</h2>
          <div class="setting-row">
            <label for="guanyu-limit">最大倍率</label>
            <div class="stepper">
              <button aria-label="降低最大倍率" disabled={maxMultiplier === undefined || maxMultiplier <= 1} onclick={() => { maxMultiplier = Math.max(1, Math.round(((maxMultiplier ?? 2) - 0.1) * 10) / 10); }}>−</button>
              <input id="guanyu-limit" aria-label="最大倍率" type="number" min="1" max="5" step="0.1" bind:value={maxMultiplier} />
              <span aria-hidden="true">×</span>
              <button aria-label="提高最大倍率" disabled={maxMultiplier === undefined || maxMultiplier >= 5} onclick={() => { maxMultiplier = Math.min(5, Math.round(((maxMultiplier ?? 2) + 0.1) * 10) / 10); }}>+</button>
            </div>
            <span class="muted">1.0–5.0 倍</span>
          </div>
          <p class="help">调高上限不会提高当前增益。</p>
        </section>
        <section class="preset-settings">
          <h2>常用档位 <small>{gainPresets.length} / 8</small></h2>
          <p class="help">额外增益百分比，每行 4 个，最多两行。超出上限的档位会禁用。</p>
          <div class="preset-editor" aria-label="已设置的常用档位">{#each gainPresets as extra (extra)}<button class="button preset-chip" aria-label={`移除 ${extra === 0 ? '原声' : `+${extra}%`} 档位`} onclick={() => { gainPresets = gainPresets.filter(item => item !== extra); }}><span>{extra === 0 ? '原声' : `+${extra}%`}</span><span aria-hidden="true">×</span></button>{/each}</div>
          <div class="preset-add"><label for="guanyu-preset-extra">额外增益</label><input id="guanyu-preset-extra" aria-label="新增档位百分比" type="number" min="0" max="400" step="1" placeholder="例如 200" bind:value={presetExtra} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); addPreset(); } }} /><span>%</span><button class="button" disabled={gainPresets.length >= 8} onclick={addPreset}>添加档位</button><button class="button" onclick={() => { gainPresets = [...defaults.gainPresets]; error = ''; }}>恢复默认档位</button></div>
        </section>
        <section class="room-section">
          <h2>当前房间</h2>
          <p class="room-id">{sound.roomId ? `房间 ${sound.roomId}` : '等待识别直播间'}</p>
          <p class="live-note">以下操作立即生效，单独记住当前房间。</p>
          <div class="setting-row gain-toggle"><span id="guanyu-gain-label">额外增益</span>
            <button class="switch" role="switch" aria-labelledby="guanyu-gain-label" aria-checked={sound.amount > 100} disabled={!sound.available || sound.maxAmount === 100} onclick={gain.toggle}><span></span></button>
          </div>
          <div class="gain-controls">
            <div class="range-block">
              <input aria-label="当前房间额外增益" type="range" min="0" max={sound.maxAmount - 100} step="1" value={sound.amount - 100} disabled={!sound.available || sound.maxAmount === 100} oninput={event => gain.setAmount(Number(event.currentTarget.value) + 100)} />
              <div class="range-scale"><span>0%</span><span>+{sound.maxAmount - 100}%</span></div>
            </div>
            <output class="gain-value">{sound.amount > 100 ? '+' : ''}{sound.amount - 100}%</output>
            <button class="button" disabled={!sound.available || sound.amount === 100} onclick={() => gain.setAmount(100)}>恢复原声</button>
          </div>
          <p class="help">只影响当前房间，不改变播放器音量。</p>
          <p class="status" role="status">{sound.status}</p>
          {#if sound.error}<p class="error" role="alert">{sound.error}</p>{/if}
        </section>
      {/if}
      {#if outsideChange}<p class="error" role="alert">设置已在其他页面更新。当前草稿保留，请放弃更改后重新编辑。</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </main>
  </div>

  <footer class="window-footer" inert={confirming}>
    <p role="status">{dirtyCount ? `有 ${dirtyCount} 项未保存的修改` : '所有设置已保存'}</p>
    <div><button class="button" onclick={() => { reset(); finish(); }}>放弃更改</button><button class="button primary" onclick={save}>保存全部</button></div>
  </footer>

  {#if confirming}
    <div class="confirm-layer">
      <div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="guanyu-confirm-title" tabindex="-1" use:focusConfirm>
        <h2 id="guanyu-confirm-title">要保存本次修改吗？</h2>
        <p>还有 {dirtyCount} 项设置未保存。</p>
        <div class="confirm-actions"><button class="button" onclick={() => { confirming = false; }}>继续编辑</button><button class="button" onclick={() => { reset(); confirming = false; finish(); }}>放弃更改</button><button class="button primary" onclick={() => { save(); confirming = false; }}>保存并关闭</button></div>
      </div>
    </div>
  {/if}
</dialog>

<script lang="ts" module>
  function focusConfirm(node: HTMLElement) {
    const previous = (node.getRootNode() as ShadowRoot).activeElement;
    node.focus({ preventScroll: true });
    return { destroy() { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); } };
  }
</script>
