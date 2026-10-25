---
name: 2d-physics-collision
description: 教AI编写不穿模的2D打砖块物理引擎：AABB矩形碰撞检测、最小重叠轴速度反转、挡板动态出射角计算。适用于打砖块、弹球等2D街机游戏。
trigger_keywords: [碰撞, 穿模, AABB, 反弹, 挡板, 砖块, 物理, 打砖块, collision, bounce]
---

# 2D 物理碰撞引擎（打砖块专用）

## 1. 技能定位
此 Skill 用于指导 AI 编写**不穿模、不抖动、手感好**的 2D 打砖块（Breakout/弹球）物理引擎，覆盖三个核心问题：

1. **AABB 矩形碰撞检测**——球与砖块/挡板/墙壁的相交判定
2. **最小重叠轴反转**——计算 X/Y 轴重叠量，取较小的轴反转速度，杜绝穿模
3. **挡板动态出射角**——按击中位置计算水平出射角，避免死板反弹

## 2. 坐标与碰撞体约定
统一使用**中心点 + 宽高**表示，避免角点坐标混用导致的计算错误：

```javascript
// 球
ball = { x, y, r, vx, vy }            // 圆形，但按 AABB 处理（用 2r 作为边长）
// 砖块
brick = { x, y, w, h, alive: true }   // 矩形
// 挡板
paddle = { x, y, w, h, vx }
```

## 3. AABB 碰撞检测

### 3.1 相交判定
```javascript
function isColliding(a, b) {
    // a, b 均为中心点 + 宽高；球的宽高 = 2 * r
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
           Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
```

### 3.2 计算两轴重叠量（核心）
```javascript
function getOverlap(a, b) {
    const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x); // > 0 才相交
    const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
    return { overlapX, overlapY };
}
```

## 4. 最小重叠轴速度反转（防止穿模的关键）

**规则：重叠量较小的轴是"最少穿透方向"，只反转该轴的速度，并把球推出到刚好接触的位置（位置修正）。**

```javascript
function resolveBallBrick(ball, brick) {
    const { overlapX, overlapY } = getOverlap(ball, brick);
    if (overlapX <= 0 || overlapY <= 0) return false; // 未相交

    if (overlapX < overlapY) {
        // X 轴重叠更少 → 球从侧面撞到砖块 → 反转水平速度
        ball.vx = -ball.vx;
        // 位置修正：把球沿 X 轴推出
        ball.x += (ball.x > brick.x ? 1 : -1) * overlapX;
    } else {
        // Y 轴重叠更少 → 球从上方/下方撞到砖块 → 反转垂直速度
        ball.vy = -ball.vy;
        ball.y += (ball.y > brick.y ? 1 : -1) * overlapY;
    }
    brick.alive = false;
    return true;
}
```

**为什么必须做位置修正（Deepest Penetration Resolution）：**
只反转速度不推出位置，下一帧球仍重叠 → 再次反转 → 球卡在砖块里来回抖动甚至穿过去。

### 4.1 球撞墙
```javascript
if (ball.x - ball.r < 0)        { ball.x = ball.r;        ball.vx = -ball.vx; }  // 左墙
if (ball.x + ball.r > W)        { ball.x = W - ball.r;    ball.vx = -ball.vx; }  // 右墙
if (ball.y - ball.r < 0)        { ball.y = ball.r;        ball.vy = -ball.vy; }  // 顶墙
// 底部：丢球，游戏结束判定
```

## 5. 挡板反弹（动态出射角）

**规则：击中挡板越靠边，出射角越大；击中正中间，垂直向上。速度大小恒定，只改变方向。**

```javascript
function bounceOffPaddle(ball, paddle) {
    // 1. 计算击中位置比例：挡板最左 = -1，正中 = 0，最右 = +1
    const hitPos = (ball.x - paddle.x) / (paddle.w / 2); // 钳制到 [-1, 1]
    const t = Math.max(-1, Math.min(1, hitPos));

    // 2. 映射为出射角（最大 65°，避免过于水平导致长时间横飞）
    const MAX_ANGLE = 65 * Math.PI / 180;
    const angle = t * MAX_ANGLE;

    // 3. 保持速率不变，分解为分速度
    const speed = Math.hypot(ball.vx, ball.vy) || DEFAULT_SPEED;
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle); // 负号：向上

    // 4. 位置修正：把球顶出挡板上表面，防止粘连
    ball.y = paddle.y - paddle.h / 2 - ball.r;

    // 5. 保底垂直分量（防止 speed 太小或 angle 接近 90° 时球横飞）
    if (Math.abs(ball.vy) < speed * 0.3) ball.vy = -speed * 0.3;
}
```

**挡板反弹常见坑：**
- 球从挡板下方/侧面擦过时不应触发反弹，只在 `ball.vy > 0`（向下运动）且与挡板上半区相交时触发
- 击中位置用**球心 x 相对挡板中心**计算，而不是球的左/右边缘

## 6. 防穿模三板斧（高速球场景必读）

| 问题 | 原因 | 解决方案 |
| :--- | :--- | :--- |
| 高速球穿过薄砖块 | 一帧内位移 > 砖块厚度，本帧未相交 | **子步进（substep）**：把一帧拆成 2~4 个子步，每步先检测碰撞再移动 |
| 一帧内穿透多块砖 | 球停留在重叠状态被多次反弹 | 每个子步**最多只处理一次反弹**（记录 `bouncedThisStep`），或对砖块去重 |
| 抖动 / 卡在边缘 | 只反转速度未修正位置 | 第 4 节的位置修正（按重叠量推出） |

```javascript
// 子步进示例：防止高速穿模
const SUBSTEPS = 3;
function updateBall(ball) {
    for (let i = 0; i < SUBSTEPS; i++) {
        ball.x += ball.vx * dt / SUBSTEPS;
        ball.y += ball.vy * dt / SUBSTEPS;
        collideWalls(ball);
        collidePaddle(ball);
        collideBricks(ball); // 每子步只吸收一块砖的碰撞
    }
}
```

## 7. 完整代码示例（打砖块核心循环）

```javascript
const W = 390, H = 700, DEFAULT_SPEED = 5;

export default {
  data: {
    ball: { x: W / 2, y: 400, r: 6, vx: 3, vy: -4 },
    paddle: { x: W / 2, y: 650, w: 80, h: 12 },
    bricks: []
  },
  onReady() { this.buildBricks(); this.startLoop(); },

  buildBricks() {
    const rows = 5, cols = 7, bw = 46, bh = 16, gap = 4, top = 60, left = 12;
    this.bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.bricks.push({
          x: left + c * (bw + gap) + bw / 2,
          y: top + r * (bh + gap) + bh / 2,
          w: bw, h: bh, alive: true
        });
  },

  update(dt) {
    const ball = this.data.ball;
    const SUBSTEPS = 3;
    for (let i = 0; i < SUBSTEPS; i++) {
      ball.x += ball.vx * dt / SUBSTEPS;
      ball.y += ball.vy * dt / SUBSTEPS;
      this.collideWalls(ball);
      this.collidePaddle(ball);
      if (this.collideBricks(ball)) break; // 每子步只反弹一次
    }
  },

  collideWalls(ball) {
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = -ball.vx; }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -ball.vx; }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = -ball.vy; }
  },

  collidePaddle(ball) {
    const p = this.data.paddle;
    if (ball.vy <= 0) return; // 只处理向下运动
    if (Math.abs(ball.x - p.x) < (p.w + ball.r * 2) / 2 &&
        ball.y + ball.r > p.y - p.h / 2 &&
        ball.y < p.y) {
      const t = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.w / 2)));
      const angle = t * (65 * Math.PI / 180);
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.vx = speed * Math.sin(angle);
      ball.vy = -speed * Math.cos(angle);
      ball.y = p.y - p.h / 2 - ball.r;
    }
  },

  collideBricks(ball) {
    const rect = { x: ball.x, y: ball.y, w: ball.r * 2, h: ball.r * 2 };
    for (const b of this.data.bricks) {
      if (!b.alive) continue;
      const overlapX = (rect.w + b.w) / 2 - Math.abs(rect.x - b.x);
      const overlapY = (rect.h + b.h) / 2 - Math.abs(rect.y - b.y);
      if (overlapX <= 0 || overlapY <= 0) continue;

      if (overlapX < overlapY) {
        ball.vx = -ball.vx;
        ball.x += (rect.x > b.x ? 1 : -1) * overlapX;
      } else {
        ball.vy = -ball.vy;
        ball.y += (rect.y > b.y ? 1 : -1) * overlapY;
      }
      b.alive = false;
      return true;
    }
    return false;
  },

  onDestroy() { this.stopLoop(); }
}
```

## 8. 手感调参参考

| 参数 | 推荐值 | 作用 |
| :--- | :--- | :--- |
| 挡板最大出射角 MAX_ANGLE | 55°~70°（默认 65°） | 越大越容易把球打向边角，策略性越强 |
| 挡板保底垂直分量 | 0.3 × speed | 防止球近乎水平横飞 |
| 子步进数 SUBSTEPS | 2~4（默认 3） | 球速越快取越大，防穿模 |
| 球速增速 | 每消 10 块砖 +0.3 | 保持难度曲线 |
| 球初始 vx/vy | 3 / -4（略偏移） | 避免开局垂直来回无变化 |

## 9. 常见问题与排查

| 现象 | 可能原因 | 解决方案 |
| :--- | :--- | :--- |
| 球穿过砖块消失 | 球速过快，一帧位移超过砖厚 | 增加 SUBSTEPS 子步进（第 6 节） |
| 球在砖块里抖动 | 反转了速度但没做位置修正 | 补上最小重叠量的位置推出 |
| 球总是斜着固定角度反弹 | 直接 `vx = -vx` 未区分碰撞轴 | 用最小重叠轴判断（第 4 节） |
| 挡板反弹角度死板（只会原路返回） | 击中位置未参与计算 | 用 hitPos 映射动态角度（第 5 节） |
| 球粘在挡板上 | 反弹后位置未修正出碰撞区 | `ball.y = paddle.y - h/2 - r` 顶出 |
| 球从挡板下方穿透 | 未检查 `ball.vy > 0` 方向 | 只在向下运动且相交时反弹 |
| 一帧连续消多块砖导致异常 | 同子步多次反转速度 | 每子步只处理一次反弹后 break |

## 10. 注意事项
- **先移动、再检测、后修正位置**的顺序不能乱，否则修正量基于旧位置会失效。
- 速度分解反弹（挡板）与速度反转反弹（砖块/墙）是两套逻辑，不要混用。
- 判断"哪个轴先碰撞"永远用**重叠量小的轴**，不要用速度方向猜。
- 球速提升时同步提高子步进数，否则必然出现穿模。
- 消砖判定用 `alive` 标记，遍历中不要直接从数组 `splice`（会跳过下一个元素），帧末统一清理。
