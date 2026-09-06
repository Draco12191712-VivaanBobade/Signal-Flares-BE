import {
  world,
  system,
  ItemStack,
  EquipmentSlot,
  EntityComponentTypes,
  ItemComponentTypes,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
const VERSION = "0.0.1-alpha.1";
const NS = "signal_flares";
const DEFAULTS = {
  chat_massage: false,
  flare_speed: 2.5,
  flare_no_gravity_ticks: 25,
  flare_gun_inaccuracy: 15,
  green_glow_stick_duration: 900,
  pink_glow_stick_duration: 900,
  cyan_glow_stick_duration: 900,
  sticky_green_glow_stick_duration: 900,
  sticky_pink_glow_stick_duration: 900,
  sticky_cyan_glow_stick_duration: 900,
  echo_glow_stick_duration: 140,
};
const cfgCache = new Map();
function cfg(key) {
  if (cfgCache.has(key)) return cfgCache.get(key);
  let v;
  try {
    v = world.getDynamicProperty(`${NS}:${key}`);
  } catch {
    v = undefined;
  }
  if (v === undefined) v = DEFAULTS[key];
  cfgCache.set(key, v);
  return v;
}
function setCfg(key, value) {
  try {
    world.setDynamicProperty(`${NS}:${key}`, value);
  } catch {
  }
  cfgCache.set(key, value);
}
const SHELLS = [
  { key: "Red", item: "red_flare_shell", entity: "red_flare", smoke: "red_smoke" },
  { key: "Green", item: "green_flare_shell", entity: "green_flare", smoke: "green_smoke" },
  { key: "Blue", item: "blue_flare_shell", entity: "blue_flare", smoke: "blue_smoke" },
  { key: "White", item: "white_flare_shell", entity: "white_flare", smoke: "white_smoke" },
  { key: "Yellow", item: "yellow_flare_shell", entity: "yellow_flare", smoke: "yellow_smoke" },
  { key: "Pink", item: "pink_flare_shell", entity: "pink_flare", smoke: "pink_smoke" },
  { key: "Cyan", item: "cyan_flare_shell", entity: "cyan_flare", smoke: "cyan_smoke" },
  { key: "Orange", item: "orange_flare_shell", entity: "orange_flare", smoke: "orange_smoke" },
  { key: "Black", item: "black_flare_shell", entity: "black_flare", smoke: "black_smoke" },
  {
    key: "Glowstone", item: "glowstone_flare_shell", entity: "glowstone_flare", smoke: "white_smoke",
    effect: { id: "night_vision", ticks: 600 },
  },
  {
    key: "Amethyst", item: "amethyst_flare_shell", entity: "amethyst_flare", smoke: "amethyst_smoke",
    effect: { id: "glowing", ticks: 300 },
  },
  {
    key: "Iron", item: "iron_flare_shell", entity: "iron_flare", smoke: "iron_smoke",
    effect: { id: "strength", ticks: 200 },
  },
  { key: "Echo", item: "echo_flare_shell", entity: null, smoke: null, sonic: true },
];
const SHELL_BY_KEY = new Map(SHELLS.map((s) => [s.key, s]));
const SHELL_BY_ITEM = new Map(SHELLS.map((s) => [`${NS}:${s.item}`, s]));
const SMOKE_BY_ENTITY = new Map(
  SHELLS.filter((s) => s.entity).map((s) => [`${NS}:${s.entity}`, `${NS}:${s.smoke}`])
);
const STICKS = [
  {
    item: "green_light_stick", entity: "light_stick_e", dust: `${NS}:glow_dust`,
    duration: "green_glow_stick_duration", speed: 1.3, offset: 1.5, sticky: false,
  },
  {
    item: "pink_light_stick", entity: "pink_light_stick_e", dust: `${NS}:pink_glow_dust`,
    duration: "pink_glow_stick_duration", speed: 1.3, offset: 1.5, sticky: false,
  },
  {
    item: "cyan_light_stick", entity: "cyan_light_stick_e", dust: `${NS}:cyan_glow_dust`,
    duration: "cyan_glow_stick_duration", speed: 1.3, offset: 1.5, sticky: false,
  },
  {
    item: "stickly_light_stick", entity: "sticky_light_stick_e", dust: `${NS}:glow_dust`,
    duration: "sticky_green_glow_stick_duration", speed: 2.2, offset: 1.8, sticky: true,
  },
  {
    item: "sticky_cyan_light_stick", entity: "sticky_cyan_light_stick_e", dust: `${NS}:cyan_glow_dust`,
    duration: "sticky_cyan_glow_stick_duration", speed: 2.2, offset: 1.8, sticky: true,
  },
  {
    item: "sticky_pink_light_stick", entity: "sticky_pink_light_stick_e", dust: `${NS}:pink_glow_dust`,
    duration: "sticky_pink_glow_stick_duration", speed: 2.2, offset: 1.8, sticky: true,
  },
  {
    item: "echo_light_stick", entity: "echo_light_stick_e", dust: null,
    duration: "echo_glow_stick_duration", speed: 1.3, offset: 1.5, sticky: false, echo: true,
  },
];
const STICK_BY_ITEM = new Map(STICKS.map((s) => [`${NS}:${s.item}`, s]));
const STICK_BY_ENTITY = new Map(STICKS.map((s) => [`${NS}:${s.entity}`, s]));
const GUN = `${NS}:flare_gun`;
const RANGE_FINDER = `${NS}:range_finder`;
const LIGHT_BLOCK = `${NS}:light_stick_block`;
const SOUNDS = {
  reload: "crossbow.loading.end",
  shoot: "crossbow.shoot",
  launch: "firework.launch",
  sonic: "mob.warden.sonic_boom",
  throw: "random.bow",
  ping: "note.pling",
  echo: "block.sculk_sensor.clicking_stop",
  break: "random.break",
  fit: "random.anvil_use",
};
const LORE_EMPTY = "§7Sneak + Use to reload.";
const LORE_PREFIX = "§rLoaded with: §9";
const LORE_SUFFIX = " Flare Shell";
const LAST_SIGNAL_LORE = "§bLast Signal";
const isValid = (e) =>
  !!e && (typeof e.isValid === "function" ? e.isValid() : e.isValid !== false);
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const rand = (a, b) => a + Math.random() * (b - a);
function safeSound(dimension, location, id, volume, pitch) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
  }
}
function safeParticle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
  }
}
function getHeld(player) {
  try {
    return player.getComponent(EntityComponentTypes.Equippable)
      ?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}
function setHeld(player, stack) {
  try {
    player.getComponent(EntityComponentTypes.Equippable)
      ?.setEquipment(EquipmentSlot.Mainhand, stack);
  } catch {
  }
}
function consumeOne(player, typeId) {
  try {
    const inv = player.getComponent(EntityComponentTypes.Inventory)?.container;
    if (!inv) return false;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId !== typeId) continue;
      if (it.amount > 1) {
        it.amount -= 1;
        inv.setItem(i, it);
      } else {
        inv.setItem(i, undefined);
      }
      return true;
    }
  } catch {
  }
  return false;
}
function countItems(player, typeId) {
  let n = 0;
  try {
    const inv = player.getComponent(EntityComponentTypes.Inventory)?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === typeId) n += it.amount;
    }
  } catch {
  }
  return n;
}
function loadedColor(stack) {
  const lore = stack?.getLore?.() ?? [];
  for (const line of lore) {
    if (!line.startsWith(LORE_PREFIX)) continue;
    const key = line.slice(LORE_PREFIX.length, line.length - LORE_SUFFIX.length);
    if (SHELL_BY_KEY.has(key)) return key;
  }
  return null;
}
function withLoaded(stack, colorKey) {
  const lore = (stack.getLore() ?? []).filter(
    (l) => !l.startsWith(LORE_PREFIX) && l !== LORE_EMPTY
  );
  lore.unshift(colorKey ? `${LORE_PREFIX}${colorKey}${LORE_SUFFIX}` : LORE_EMPTY);
  stack.setLore(lore);
  return stack;
}
function openReloadForm(player, attempt = 0) {
  const available = SHELLS
    .map((s) => ({ shell: s, count: countItems(player, `${NS}:${s.item}`) }))
    .filter((e) => e.count > 0);
  const form = new ActionFormData().title("Reload Flare Gun");
  if (available.length === 0) {
    form.body("§7No flare shells in your inventory.");
    form.button("Close");
  } else {
    form.body("§7Choose a shell to load.");
    for (const e of available) {
      form.button(`${e.shell.key} Flare Shell §7x${e.count}`, `textures/${NS}/item/${e.shell.item}`);
    }
    form.button("§7Cancel");
  }
  form.show(player).then((res) => {
    if (res.canceled) {
      if (res.cancelationReason === FormCancelationReason.UserBusy && attempt < 12) {
        system.runTimeout(() => openReloadForm(player, attempt + 1), 10);
      }
      return;
    }
    if (available.length === 0 || res.selection >= available.length) return;
    const shell = available[res.selection].shell;
    if (!isValid(player)) return;
    const held = getHeld(player);
    if (held?.typeId !== GUN) return;
    if (!consumeOne(player, `${NS}:${shell.item}`)) return;
    setHeld(player, withLoaded(held, shell.key));
    safeSound(player.dimension, player.location, SOUNDS.reload, 1, 1.4);
  }).catch(() => {
  });
}
function fireGun(player, held) {
  const colorKey = loadedColor(held);
  if (!colorKey) return;
  const shell = SHELL_BY_KEY.get(colorKey);
  const dim = player.dimension;
  const eye = player.getHeadLocation();
  const look = player.getViewDirection();
  if (shell.entity) {
    try {
      const flare = dim.spawnEntity(`${NS}:${shell.entity}`, {
        x: player.location.x, y: eye.y - 0.1, z: player.location.z,
      });
      const proj = flare.getComponent(EntityComponentTypes.Projectile);
      if (proj) {
        proj.owner = player;
        proj.shoot(scale(norm(look), cfg("flare_speed")), {
          uncertainty: cfg("flare_gun_inaccuracy"),
        });
      }
    } catch {
    }
  }
  if (shell.sonic) {
    safeParticle(dim, "minecraft:sonic_explosion", {
      x: eye.x + look.x, y: eye.y + look.y, z: eye.z + look.z,
    });
    safeSound(dim, player.location, SOUNDS.sonic, 6, 1);
  }
  if (shell.effect) {
    try {
      player.addEffect(shell.effect.id, shell.effect.ticks, {
        amplifier: 0, showParticles: false,
      });
    } catch {
    }
  }
  if (cfg("chat_massage")) {
    const l = player.location;
    world.sendMessage(
      `§l§eX: ${Math.round(l.x)} §l§eY: ${Math.round(l.y)} §l§eZ: ${Math.round(l.z)} ` +
      `§aPlayer: ${player.name}`
    );
  }
  safeParticle(dim, "minecraft:large_explosion", {
    x: eye.x + look.x, y: eye.y + look.y, z: eye.z + look.z,
  });
  const pitch = Math.floor(rand(10, 17)) * 0.1;
  safeSound(dim, player.location, SOUNDS.launch, 2, pitch);
  safeSound(dim, player.location, SOUNDS.shoot, 2, pitch);
  const next = withLoaded(held, null);
  const dur = next.getComponent(ItemComponentTypes.Durability);
  if (dur) {
    if (dur.damage + 1 >= dur.maxDurability) {
      setHeld(player, undefined);
      safeSound(dim, player.location, SOUNDS.break, 1, 1);
      return;
    }
    dur.damage += 1;
  }
  setHeld(player, next);
  try { player.startItemCooldown("signal_flares_gun", 20); } catch { /* ignore */ }
}
function useRangeFinder(player) {
  const dim = player.dimension;
  const eye = player.getHeadLocation();
  const dir = player.getViewDirection();
  let hit;
  try {
    hit = player.getBlockFromViewDirection({
      maxDistance: 250, includeLiquidBlocks: false, includePassableBlocks: false,
    });
  } catch { hit = undefined; }
  const end = hit
    ? { x: hit.block.location.x, y: hit.block.location.y, z: hit.block.location.z }
    : { x: eye.x + dir.x * 250, y: eye.y + dir.y * 250, z: eye.z + dir.z * 250 };
  const start = { x: player.location.x, y: player.location.y + 1.5, z: player.location.z };
  drawLine(dim, start, end);
  const d = Math.hypot(
    end.x - player.location.x, end.y - player.location.y, end.z - player.location.z
  );
  try {
    player.onScreenDisplay.setActionBar(
      d > 249 ? "Distance: 250+" : `Distance: ${d.toFixed(1)}`
    );
  } catch {
  }
  safeSound(dim, player.location, SOUNDS.ping, 0.1, 1.6);
  try { player.startItemCooldown("signal_flares_range_finder", 60); } catch { /* ignore */ }
}
function drawLine(dim, start, end) {
  const dist = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  let steps = Math.min(250, Math.round(dist));
  if (steps <= 0) return;
  const sx = (end.x - start.x) / steps;
  const sy = (end.y - start.y) / steps;
  const sz = (end.z - start.z) / steps;
  for (let i = 0; i <= steps; i++) {
    safeParticle(dim, `${NS}:range_line`, {
      x: start.x + sx * i, y: start.y + sy * i, z: start.z + sz * i,
    });
  }
}
function throwStick(player, held, def) {
  const dim = player.dimension;
  const look = player.getViewDirection();
  try {
    const e = dim.spawnEntity(`${NS}:${def.entity}`, {
      x: player.location.x,
      y: player.location.y + def.offset,
      z: player.location.z,
    });
    try {
      e.applyImpulse(scale(look, def.speed * 0.35));
    } catch {
    }
    try {
      e.setRotation({ x: rand(-90, 90), y: rand(-180, 180) });
    } catch {
    }
  } catch {
    return;
  }
  if (held.amount > 1) {
    held.amount -= 1;
    setHeld(player, held);
  } else {
    setHeld(player, undefined);
  }
  safeSound(dim, player.location, SOUNDS.throw, 1, 1.25);
  try { player.startItemCooldown("signal_flares_stick", 2); } catch { /* ignore */ }
}
const stickState = new Map();
function stateFor(entity) {
  let s = stickState.get(entity.id);
  if (s) return s;
  s = {
    age: Number(entity.getDynamicProperty(`${NS}:age`) ?? 0),
    bounces: 0,
    stuck: entity.getDynamicProperty(`${NS}:stuck`) === true,
    lx: entity.getDynamicProperty(`${NS}:lx`),
    ly: entity.getDynamicProperty(`${NS}:ly`),
    lz: entity.getDynamicProperty(`${NS}:lz`),
    cleanup: 0,
  };
  stickState.set(entity.id, s);
  return s;
}
function isReplaceableForLight(block) {
  return block && (block.isAir || block.typeId === LIGHT_BLOCK);
}
function clearLightAt(dim, s) {
  if (s.lx === undefined) return;
  try {
    const b = dim.getBlock({ x: s.lx, y: s.ly, z: s.lz });
    if (b && b.typeId === LIGHT_BLOCK) b.setType("minecraft:air");
  } catch {
  }
}
function tickStick(entity, def) {
  const s = stateFor(entity);
  const dim = entity.dimension;
  const loc = entity.location;
  if (s.cleanup > 0) {
    s.cleanup -= 1;
    if (s.cleanup === 0) {
      clearLightAt(dim, s);
      try { entity.remove(); } catch {
      }
      stickState.delete(entity.id);
    }
    return;
  }
  s.age += 1;
  if (s.age % 20 === 0) {
    try { entity.setDynamicProperty(`${NS}:age`, s.age); } catch { /* ignore */ }
  }
  if (s.age >= cfg(def.duration)) {
    clearLightAt(dim, s);
    s.cleanup = 5;
    return;
  }
  const bx = Math.floor(loc.x), by = Math.floor(loc.y), bz = Math.floor(loc.z);
  if (bx !== s.lx || by !== s.ly || bz !== s.lz) {
    clearLightAt(dim, s);
    try {
      const b = dim.getBlock({ x: bx, y: by, z: bz });
      if (isReplaceableForLight(b)) {
        b.setType(LIGHT_BLOCK);
        s.lx = bx; s.ly = by; s.lz = bz;
        entity.setDynamicProperty(`${NS}:lx`, bx);
        entity.setDynamicProperty(`${NS}:ly`, by);
        entity.setDynamicProperty(`${NS}:lz`, bz);
      } else {
        s.lx = s.ly = s.lz = undefined;
      }
    } catch {
    }
  }
  if (def.sticky) {
    if (!s.stuck && touchingSurface(dim, loc, entity)) {
      s.stuck = true;
      try {
        entity.setDynamicProperty(`${NS}:stuck`, true);
        entity.clearVelocity();
        entity.triggerEvent(`${NS}:stick`);
      } catch {
      }
    }
  } else if (s.bounces < 3 && entity.isOnGround) {
    s.bounces += 1;
    try {
      const v = entity.getVelocity();
      entity.applyImpulse({ x: v.x * 0.1, y: 0.3, z: v.z * 0.1 });
      entity.setRotation({ x: rand(-90, 90), y: rand(-180, 180) });
    } catch {
    }
  }
  if (def.dust) {
    safeParticle(dim, def.dust, { x: loc.x, y: loc.y + 0.2, z: loc.z });
    if (def.sticky && Math.random() < 0.5) {
      safeParticle(dim, `${NS}:honey_glow_dust`, { x: loc.x, y: loc.y + 0.2, z: loc.z });
    }
  }
  if (def.echo && s.age % 15 === 0) {
    safeSound(dim, loc, SOUNDS.echo, 1, 1);
    safeParticle(dim, "minecraft:sonic_explosion", { x: loc.x, y: loc.y + 0.2, z: loc.z });
  }
}
function touchingSurface(dim, loc, entity) {
  if (entity.isOnGround) return true;
  const probes = [
    { x: loc.x, y: loc.y + 0.9, z: loc.z },
    { x: loc.x - 0.6, y: loc.y, z: loc.z },
    { x: loc.x + 0.6, y: loc.y, z: loc.z },
    { x: loc.x, y: loc.y, z: loc.z + 0.6 },
    { x: loc.x, y: loc.y, z: loc.z - 0.6 },
  ];
  for (const p of probes) {
    try {
      const b = dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
      if (b && !isReplaceableForLight(b) && !b.isLiquid) return true;
    } catch {
    }
  }
  return false;
}
const flareState = new Map();
function tickFlare(entity) {
  let s = flareState.get(entity.id);
  if (!s) {
    s = { age: 0, prevY: entity.location.y, slowed: false, gravity: false };
    flareState.set(entity.id, s);
  }
  const dim = entity.dimension;
  const loc = entity.location;
  s.age += 1;
  if (s.age > 1200) {
    try { entity.remove(); } catch {
    }
    flareState.delete(entity.id);
    return;
  }
  if (!s.gravity && s.age >= cfg("flare_no_gravity_ticks")) {
    s.gravity = true;
    try { entity.triggerEvent(`${NS}:gravity_on`); } catch {
    }
  }
  if (loc.y < s.prevY) {
    try {
      const v = entity.getVelocity();
      entity.clearVelocity();
      entity.applyImpulse(
        s.slowed
          ? { x: v.x, y: v.y * 0.7, z: v.z }
          : { x: v.x * 0.7, y: v.y * 0.7, z: v.z * 0.7 }
      );
    } catch {
    }
    s.slowed = true;
  }
  s.prevY = loc.y;
  safeParticle(dim, `${NS}:sparks`, loc);
  if (!s.slowed) {
    const smoke = SMOKE_BY_ENTITY.get(entity.typeId);
    if (smoke) {
      safeParticle(dim, smoke, loc);
      safeParticle(dim, smoke, { x: loc.x, y: loc.y + rand(1, 3), z: loc.z });
      if (Math.random() < 0.5) {
        safeParticle(dim, smoke, { x: loc.x + rand(1, 3), y: loc.y, z: loc.z });
      }
      if (Math.random() < 0.5) {
        safeParticle(dim, smoke, { x: loc.x, y: loc.y, z: loc.z + rand(1, 3) });
      }
    }
  }
}
function hasLastSignal(stack) {
  return (stack?.getLore?.() ?? []).includes(LAST_SIGNAL_LORE);
}
function tryApplyLastSignal(player) {
  const eq = player.getComponent(EntityComponentTypes.Equippable);
  const chest = eq?.getEquipment(EquipmentSlot.Chest);
  if (!chest) {
    try { player.onScreenDisplay.setActionBar("§7Wear a chestplate first."); } catch { /* ignore */ }
    return false;
  }
  if (hasLastSignal(chest)) {
    try { player.onScreenDisplay.setActionBar("§7Already has Last Signal."); } catch { /* ignore */ }
    return false;
  }
  if (!consumeOne(player, `${NS}:red_flare_shell`)) return false;
  const lore = chest.getLore() ?? [];
  lore.push(LAST_SIGNAL_LORE);
  chest.setLore(lore);
  eq.setEquipment(EquipmentSlot.Chest, chest);
  safeSound(player.dimension, player.location, SOUNDS.fit, 0.8, 1.4);
  try { player.onScreenDisplay.setActionBar("§bLast Signal applied."); } catch { /* ignore */ }
  return true;
}
function fireLastSignal(entity) {
  try {
    const chest = entity.getComponent(EntityComponentTypes.Equippable)
      ?.getEquipment(EquipmentSlot.Chest);
    if (!hasLastSignal(chest)) return;
    const flare = entity.dimension.spawnEntity(`${NS}:red_flare`, entity.location);
    const proj = flare.getComponent(EntityComponentTypes.Projectile);
    proj?.shoot({
      x: rand(-0.2, 0.2) * cfg("flare_speed"),
      y: cfg("flare_speed"),
      z: rand(-0.2, 0.2) * cfg("flare_speed"),
    });
    safeSound(entity.dimension, entity.location, SOUNDS.launch, 1, 1);
  } catch {
  }
}
const SLIDERS = [
  ["flare_speed", "Flare speed", 1, 6, 0.5],
  ["flare_no_gravity_ticks", "Flare no-gravity ticks", 0, 100, 5],
  ["flare_gun_inaccuracy", "Flare gun inaccuracy", 0, 40, 1],
  ["green_glow_stick_duration", "Green stick duration (ticks)", 100, 3000, 100],
  ["pink_glow_stick_duration", "Pink stick duration (ticks)", 100, 3000, 100],
  ["cyan_glow_stick_duration", "Cyan stick duration (ticks)", 100, 3000, 100],
  ["sticky_green_glow_stick_duration", "Sticky green duration (ticks)", 100, 3000, 100],
  ["sticky_pink_glow_stick_duration", "Sticky pink duration (ticks)", 100, 3000, 100],
  ["sticky_cyan_glow_stick_duration", "Sticky cyan duration (ticks)", 100, 3000, 100],
  ["echo_glow_stick_duration", "Echo stick duration (ticks)", 20, 1200, 20],
];
function openConfig(player) {
  const form = new ModalFormData().title(`Signal Flares v${VERSION}`);
  form.toggle("Broadcast coordinates in chat", { defaultValue: !!cfg("chat_massage") });
  for (const [key, label, min, max, step] of SLIDERS) {
    form.slider(label, min, max, { valueStep: step, defaultValue: clamp(cfg(key), min, max) });
  }
  form.show(player).then((res) => {
    if (res.canceled || !res.formValues) return;
    const v = res.formValues;
    setCfg("chat_massage", !!v[0]);
    SLIDERS.forEach(([key], i) => setCfg(key, Number(v[i + 1])));
    try { player.onScreenDisplay.setActionBar("§aSignal Flares settings saved."); } catch { /* ignore */ }
  }).catch(() => {
  });
}
function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
const report = [];
try {
  world.afterEvents.itemUse.subscribe((ev) => {
    const player = ev.source;
    const stack = ev.itemStack;
    if (!player || !stack) return;
    if (stack.typeId === GUN) {
      system.run(() => {
        if (!isValid(player)) return;
        const held = getHeld(player);
        if (held?.typeId !== GUN) return;
        const loaded = loadedColor(held);
        if (!loaded && player.isSneaking) {
          openReloadForm(player);
        } else if (loaded) {
          if ((player.getItemCooldown?.("signal_flares_gun") ?? 0) > 0) return;
          fireGun(player, held);
        } else {
          try { player.onScreenDisplay.setActionBar(LORE_EMPTY); } catch { /* ignore */ }
        }
      });
      return;
    }
    if (stack.typeId === RANGE_FINDER) {
      system.run(() => {
        if (isValid(player)) useRangeFinder(player);
      });
      return;
    }
    const stick = STICK_BY_ITEM.get(stack.typeId);
    if (stick) {
      system.run(() => {
        if (!isValid(player)) return;
        const held = getHeld(player);
        if (held?.typeId === stack.typeId) throwStick(player, held, stick);
      });
      return;
    }
    if (stack.typeId === `${NS}:red_flare_shell` && player.isSneaking) {
      system.run(() => {
        if (isValid(player)) tryApplyLastSignal(player);
      });
    }
  });
  report.push("itemUse");
} catch (e) {
  console.warn(`[SignalFlares] itemUse subscribe failed: ${e}`);
}
try {
  world.beforeEvents.entityRemove.subscribe((ev) => {
    const e = ev.removedEntity;
    if (!e) return;
    if (SMOKE_BY_ENTITY.has(e.typeId)) {
      flareState.delete(e.id);
      return;
    }
    if (!STICK_BY_ENTITY.has(e.typeId)) return;
    const s = stickState.get(e.id);
    if (s) {
      const dim = e.dimension;
      system.run(() => clearLightAt(dim, s));
      stickState.delete(e.id);
    }
  });
  report.push("entityRemove");
} catch (e) {
  console.warn(`[SignalFlares] entityRemove subscribe failed: ${e}`);
}
try {
  world.afterEvents.entityDie.subscribe((ev) => {
    const e = ev.deadEntity;
    if (e?.typeId === "minecraft:player") fireLastSignal(e);
  });
  report.push("entityDie");
} catch (e) {
  console.warn(`[SignalFlares] entityDie subscribe failed: ${e}`);
}
const DIMENSIONS = [];
for (const id of ["overworld", "nether", "the_end"]) {
  try {
    DIMENSIONS.push(world.getDimension(id));
  } catch {
  }
}
try {
  system.runInterval(() => {
    for (const dim of DIMENSIONS) {
      let entities;
      try {
        entities = dim.getEntities({ families: ["sf_active"] });
      } catch {
        continue;
      }
      for (const e of entities) {
        if (!isValid(e)) continue;
        const stick = STICK_BY_ENTITY.get(e.typeId);
        try {
          if (stick) tickStick(e, stick);
          else if (SMOKE_BY_ENTITY.has(e.typeId)) tickFlare(e);
        } catch {
        }
      }
    }
  }, 1);
  report.push("tick loop");
} catch (e) {
  console.warn(`[SignalFlares] tick loop failed: ${e}`);
}
try {
  if (system.beforeEvents?.startup) {
    system.beforeEvents.startup.subscribe((ev) => {
      try {
        ev.customCommandRegistry.registerCommand(
          {
            name: `${NS}:config`,
            description: "Open the Signal Flares settings menu",
            permissionLevel: CommandPermissionLevel.GameDirectors,
            cheatsRequired: false,
          },
          (origin) => {
            const p = origin.sourceEntity;
            if (p?.typeId === "minecraft:player") system.run(() => openConfig(p));
            return { status: CustomCommandStatus.Success };
          }
        );
      } catch (e) {
        console.warn(`[SignalFlares] command registration failed: ${e}`);
      }
    });
    report.push("command");
  }
} catch (e) {
  console.warn(`[SignalFlares] startup subscribe failed: ${e}`);
}
try {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== `${NS}:config`) return;
    const p = ev.sourceEntity;
    if (p?.typeId === "minecraft:player") system.run(() => openConfig(p));
  });
  report.push("scriptevent");
} catch (e) {
  console.warn(`[SignalFlares] scriptEventReceive subscribe failed: ${e}`);
}
console.warn(`[Signal Flares v${VERSION}] startup - ${report.join(" | ")}`);