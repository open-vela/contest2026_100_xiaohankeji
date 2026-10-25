---
name: gyroscope-control-helper
description: 教AI如何通过openvela的Sensor API调用陀螺仪和加速度计数据，用于体感游戏中的姿态识别和控制。基于VelaOS官方传感器文档。
trigger_keywords: [陀螺仪, 加速度计, 体感, 姿态, 倾斜, 传感器, 控制, sensor]
---

# 陀螺仪控制助手

## 1. 技能定位
此Skill用于指导AI或开发者调用openvela（VelaOS）系统的传感器接口，获取陀螺仪/加速度计数据，并将其转换为游戏控制指令。

**官方参考文档：** https://iot.mi.com/vela/quickapp/zh/features/system/sensor.html

## 2. 核心 API 模块
Vela 快应用通过 `@system.sensor` 模块调用设备传感器，支持加速度、陀螺仪、心率等数据。

```javascript
import sensor from '@system.sensor';
// 或
const sensor = require('@system.sensor')
```

## 3. 权限声明（manifest.json）
在使用传感器前，必须在 `src/manifest.json` 中声明权限：
```json
{
  "config": {
    "permissions": ["system.sensor"]
  }
}
```

## 4. 陀螺仪调用（体感控制首选）

### 4.1 订阅陀螺仪数据
```javascript
sensor.subscribeGyroscope({
    interval: 'game',  // 采样频率：game(约20ms) / ui(约60ms) / normal(约200ms)
    success: function(data) {
        // data.x, data.y, data.z 为三轴角速度，单位 rad/s
        console.log('陀螺仪: x=' + data.x + ', y=' + data.y + ', z=' + data.z);
        
        // 体感游戏中的典型用法：取X轴作为左右倾斜的判断依据
        let tilt = data.x;
        // 经过滤波后映射为位移量
    },
    fail: function(error) {
        console.log('陀螺仪订阅失败: ' + error.message);
    }
});
```

### 4.2 取消订阅（必须执行）
```javascript
sensor.unsubscribeGyroscope({
    success: function() { console.log('已取消陀螺仪订阅'); }
});
```

## 5. 加速度计（备选方案）
如果设备不支持陀螺仪，可用加速度计模拟倾斜控制：
```javascript
sensor.subscribeAccelerometer({
    interval: 'game',  // 游戏场景建议 'game'，约20ms/次
    callback: function(ret) {
        // ret.x, ret.y, ret.z 为三轴加速度，单位 m/s²
        // 水平放置时 x≈0, y≈0, z≈9.8
        // 倾斜角度可通过反正切计算
    }
});
```

**加速度计与陀螺仪的区别：**
- 加速度计检测的是**线性加速度**（含重力分量），适合检测倾斜角度
- 陀螺仪检测的是**角速度**，适合检测旋转动作和快速姿态变化
- 体感游戏通常两者结合使用：陀螺仪检测快速动作，加速度计校准长期姿态

## 6. 数据处理标准流程（体感控制三级处理链）

```
原始数据（rawX）
    ↓
一阶低通滤波
filteredX = filteredX × 0.7 + rawX × 0.3
（作用：平滑手腕抖动，系数0.7/0.3为推荐值，可根据手感调整）
    ↓
死区处理
if (|filteredX| < 0.5) filteredX = 0
（作用：过滤微小漂移和无意识晃动，阈值0.5为推荐值）
    ↓
比例映射
位移 = -filteredX × 0.6
（作用：将倾斜角度转为像素位移量，系数需根据屏幕宽度调整）
    ↓
边界钳制
if (位移 < 左边界) 位移 = 左边界
if (位移 > 右边界) 位移 = 右边界
```

## 7. 完整代码示例（含生命周期管理）

```javascript
// 在游戏页面中
export default {
  data: {
    filteredX: 0,
    px: 0,  // 挡板X位置
    playL: 30,
    playR: 390 - 30
  },
  onReady() {
    const self = this;
    sensor.subscribeGyroscope({
      interval: 'game',
      success: function(data) {
        // 三级处理链
        self.filteredX = self.filteredX * 0.7 + data.x * 0.3;
        let tilt = self.filteredX;
        if (tilt > -0.5 && tilt < 0.5) tilt = 0;
        self.px -= tilt * 0.6;
        if (self.px < self.playL) self.px = self.playL;
        if (self.px > self.playR) self.px = self.playR;
      },
      fail: function(error) {
        console.log('陀螺仪订阅失败，尝试使用加速度计: ' + error.message);
        // 降级到加速度计
        sensor.subscribeAccelerometer({
          interval: 'game',
          callback: function(ret) {
            // 同样的三级处理链
          }
        });
      }
    });
  },
  onDestroy() {
    // 必须在页面销毁时取消订阅，防止内存泄漏
    sensor.unsubscribeGyroscope({
      success: function() { console.log('已取消陀螺仪订阅'); }
    });
    sensor.unsubscribeAccelerometer();
  }
}
```

## 8. 设备支持说明（根据官方文档）

| 接口 | 支持设备 | 不支持设备 |
| :--- | :--- | :--- |
| subscribeGyroscope | Xiaomi Watch S3、S4、S5、小米手环9/9Pro/10、REDMI Watch 5/6 | 小米S1 Pro、手环8Pro、Redmi Watch 4、H1 |
| subscribeAccelerometer | 小米手环9/9Pro/10、Watch S5 | Watch S3、S4、S1 Pro、手环8Pro、Redmi Watch 4、H1 |

**注意：** 小米Watch S4支持陀螺仪但不支持加速度计，因此体感控制应优先使用陀螺仪API。

## 9. 常见问题与排查

| 现象 | 可能原因 | 解决方案 |
| :--- | :--- | :--- |
| 回调不触发 | manifest.json未声明权限 | 检查permissions是否包含system.sensor |
| 数据全是0 | 真机传感器未初始化或模拟器不支持 | 确认在真机上调试，模拟器不支持传感器 |
| 挡板自动漂移 | 死区阈值设置过小 | 将死区阈值从0.3调高到0.5~1.0 |
| 控制不跟手 | 滤波系数太重或采样间隔太长 | 调整滤波系数（降低旧值权重），或改用'game'档位 |

## 10. 注意事项
- 调用`subscribeGyroscope`后必须在页面销毁时调用`unsubscribeGyroscope`，否则会造成内存泄漏。
- **模拟器可能不支持传感器**，体感功能需在真机（如小米Watch S4）上调试验证。
- 不同设备的传感器量程可能不同，需根据实际设备调整映射系数。
- 如果陀螺仪不可用，可降级使用加速度计作为备选方案。
