async page => {
  await page.reload();
  await page.setViewportSize({width:1100,height:620});
  await page.waitForFunction(()=>window.preview?.pet.motion.videoArt.videos.every(v=>v.readyState>=2));
  await page.evaluate(async()=>{
    const p=preview.pet,wait=ms=>new Promise(r=>setTimeout(r,ms));
    const label=text=>document.querySelector('#status').textContent=text;
    document.querySelector('h1').textContent='1.0.1 · 桌面动作预览';
    document.querySelector('header>p').textContent='新版修正轻放及落地收尾人物形状，逐步恢复原版站姿；保留方向翻转与碰撞动作。';
    preview.reset();p.sendBounds(340,280);p.motion.set('drag');
    label('拿起 → 悬空');await wait(1500);
    label('向右甩出：保留画面朝右倾斜');p.motion.set('flight',700,-300);await wait(1500);
    label('向左甩出：同一动画水平翻转');p.motion.set('flight',-700,-300);await wait(1500);
    label('撞到侧边：>< 眼睛、侧身回弹');p.motion.impact('wall',1500,1);await wait(1550);
    label('碰到顶部：>< 眼睛、缩头护头');p.motion.impact('ceiling',1200);await wait(1750);
    label('落地缓冲：>< 眼睛、屈膝后站稳');p.sendBounds(340,VIEW.h-p.height);
    p.updateThrowMotion('flight',0,0);p.motion.impact('ground',1500);await wait(1800);
    label('持续贴地：恢复正常站立，不会一直蹲着或反复撞击');await wait(1600);
    label('沿底部滑行：保持站姿，只随速度轻微倾斜');
    p.startThrow(140,VIEW.h-p.height,700,0);await wait(2400);
    label('使用原版物理：实际甩起、碰撞与落地');p.startThrow(180,300,1050,-1030);await wait(4500);
    preview.reset();p.sendBounds(340,280);p.lastPressAt=-Infinity;
    label('拖动后停住再松手：原地放下，避免继承旧速度');
    p.onPointerDown({button:0,pointerId:1,screenX:500,screenY:350,clientX:200,clientY:130});
    p.onPointerMove({screenX:530,screenY:350});await wait(50);
    p.onPointerMove({screenX:590,screenY:350});await wait(150);p.onPointerUp();await wait(1500);
    label('非官方 AI 二创 · 动作在本机播放，不调用模型。');await wait(500);
  });
  return {recorded:true};
}
