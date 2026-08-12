const savedState=(()=>{try{return JSON.parse(localStorage.getItem('mianbaofang')||'{}')}catch{return {}}})();
const state=Object.assign({
  purchaseScene:'pickup',
  deliveryMethod:'local',
  store:'愚园路店',
  address:'静安区愚园路 601 号',
  cart:2,
  deliveryCart:2,
  lastOrderScene:'delivery',
  lastOrderMethod:'local',
  lastOrderNo:'MB202608041512'
},savedState);

const PRICE_AVERAGE_FEN=2240;
const INSULATION_FEE_FEN=300;
const LOCAL_DELIVERY_FEE_FEN=800;
const SHIPPING_FEE_FEN=1200;

function save(){localStorage.setItem('mianbaofang',JSON.stringify(state))}
function formatFen(fen){return typeof fen==='number'?`¥${(fen/100).toFixed(2)}`:'待填写地址后计算'}
function pickupSubtotalFen(){return state.cart*PRICE_AVERAGE_FEN}
function deliverySubtotalFen(){return state.deliveryCart*PRICE_AVERAGE_FEN}
function deliveryDetails(method=state.deliveryMethod){
  const isShipping=method==='shipping';
  const feeFen=state.address?isShipping?SHIPPING_FEE_FEN:LOCAL_DELIVERY_FEE_FEN:null;
  return {
    method,
    label:isShipping?'快递邮寄':'同城外卖',
    feeName:isShipping?'邮费':'配送费',
    feeFen,
    totalFen:typeof feeFen==='number'?deliverySubtotalFen()+INSULATION_FEE_FEN+feeFen:null,
    arrival:isShipping?'预计 1–3 天送达':'预计今天 16:30 前送达',
    note:isShipping?'冷链保温包装 · 满 ¥99 可包邮':'约 45 分钟送达 · ¥35 起送'
  };
}
function textAll(selector,value){document.querySelectorAll(selector).forEach(el=>{el.textContent=value})}
function showToast(message){
  let toast=document.querySelector('.toast');
  if(!toast){toast=document.createElement('div');toast.className='toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.querySelector('.phone')?.append(toast)}
  toast.textContent=message;toast.classList.add('show');
  window.clearTimeout(showToast.timer);showToast.timer=window.setTimeout(()=>toast.classList.remove('show'),1800);
}
function syncStepper(control){
  const value=Number(control.querySelector('span')?.textContent||0);
  const minus=control.querySelector('[data-step="minus"]');
  const plus=control.querySelector('[data-step="plus"]');
  if(minus){minus.disabled=value===0;minus.setAttribute('aria-label','减少数量')}
  if(plus)plus.setAttribute('aria-label','增加数量');
  control.setAttribute('aria-label',`数量 ${value}`);
}
function syncCartState(){
  const pickupEmpty=state.cart===0;
  const deliveryEmpty=state.deliveryCart===0;
  document.querySelectorAll('[data-empty-cart]').forEach(empty=>{
    const isEmpty=empty.dataset.emptyCart==='delivery'?deliveryEmpty:pickupEmpty;
    empty.hidden=!isEmpty;
    empty.previousElementSibling?.toggleAttribute('hidden',isEmpty);
  });
  document.querySelector('[data-od-id="cart-summary"]')?.toggleAttribute('hidden',pickupEmpty);
  document.querySelector('[data-od-id="cart-checkout"]')?.toggleAttribute('hidden',pickupEmpty);
  document.querySelector('[data-od-id="delivery-cart-summary"]')?.toggleAttribute('hidden',deliveryEmpty);
  document.querySelector('[data-od-id="delivery-cart-fees"]')?.toggleAttribute('hidden',deliveryEmpty);
  document.querySelector('[data-od-id="delivery-cart-checkout"]')?.toggleAttribute('hidden',deliveryEmpty);
}
function updateDeliveryUI(){
  const delivery=deliveryDetails();
  textAll('[data-delivery-count]',state.deliveryCart);
  textAll('[data-delivery-method-label]',delivery.label);
  textAll('[data-delivery-fee-name]',delivery.feeName);
  textAll('[data-delivery-fee]',formatFen(delivery.feeFen));
  textAll('[data-delivery-total]',formatFen(delivery.totalFen));
  textAll('[data-delivery-arrival]',delivery.arrival);
  document.querySelectorAll('[data-delivery-fee-label]').forEach(el=>{el.innerHTML=`${delivery.feeName} <b>${formatFen(delivery.feeFen)}</b>`});
  document.querySelectorAll('[data-checkout-link]').forEach(el=>{el.textContent=delivery.totalFen?`去结算 · ${formatFen(delivery.totalFen)}`:'先完善地址'});
  document.querySelectorAll('[data-checkout-total]').forEach(el=>{
    const isEmpty=state.deliveryCart===0;
    el.disabled=isEmpty||!delivery.totalFen;
    el.setAttribute('aria-disabled',String(el.disabled));
    el.textContent=isEmpty?'购物车为空':delivery.totalFen?`确认下单 · ${formatFen(delivery.totalFen)}`:'先完善地址';
  });
  document.querySelectorAll('[data-delivery-method]').forEach(button=>{
    const active=button.dataset.deliveryMethod===state.deliveryMethod;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
function updateCounts(){
  textAll('[data-count]',state.cart);
  textAll('[data-total]',formatFen(pickupSubtotalFen()));
  updateDeliveryUI();
  syncCartState();
}
function updateStoredLabels(){
  textAll('[data-address]',state.address||'待填写地址');
  textAll('[data-store]',state.store||'待选择门店');
}
function clearCart(scope){
  const isDelivery=scope==='delivery';
  state[isDelivery?'deliveryCart':'cart']=0;
  document.querySelectorAll(isDelivery?'[data-cart-scope="delivery"] .stepper span':'#cart-items .stepper span').forEach(count=>count.textContent='0');
  document.querySelectorAll('.stepper').forEach(syncStepper);
  save();updateCounts();document.querySelectorAll('.modal').forEach(modal=>modal.classList.remove('open'));
  showToast(isDelivery?'已清空外卖/邮寄购物车':'已清空自取购物车');
}
function currentDetailQuantity(){return Number(document.querySelector('.detail-stepper span')?.textContent||1)||1}
function finishOrder(scope){
  const isDelivery=scope!=='pickup';
  const count=isDelivery?state.deliveryCart:state.cart;
  if(count===0){showToast('购物车为空，请先添加商品');return false}
  state.lastOrderScene=isDelivery?'delivery':'pickup';
  state.lastOrderMethod=state.deliveryMethod;
  state.lastOrderNo=`MB${new Date().toISOString().slice(0,10).replaceAll('-','')}${String(Math.floor(Math.random()*900)+100)}`;
  state[isDelivery?'deliveryCart':'cart']=0;
  save();
  return true;
}
function updateSuccessPage(){
  const section=document.querySelector('[data-od-id="success-delivery"]');
  if(!section)return;
  const isDelivery=state.lastOrderScene!=='pickup';
  const delivery=deliveryDetails(state.lastOrderMethod);
  const tag=section.querySelector('.tag');
  const heading=section.querySelector('h3');
  const copy=section.querySelector('p');
  const link=document.querySelector('[data-od-id="success-actions"] .primary');
  textAll('[data-od-id="success-order-number"]',`订单号：${state.lastOrderNo}`);
  if(isDelivery){
    tag.textContent=delivery.label;
    heading.textContent=delivery.arrival;
    copy.innerHTML=`送至${state.address}<br>已包含保温包装 ${formatFen(INSULATION_FEE_FEN)} 与${delivery.feeName} ${formatFen(delivery.feeFen)}。`;
    if(link){link.textContent='查看配送订单';link.href='delivery-order-detail.html'}
  }else{
    tag.textContent='到店自取';
    heading.textContent='预计 20 分钟后可自取';
    copy.innerHTML=`取货门店：${state.store}<br>自取订单不收取保温包装费、配送费或邮费。`;
    if(link){link.textContent='查看自取订单';link.href='order-detail.html'}
  }
}
function setActiveInGroup(control){
  const group=control.parentElement;
  if(!group)return;
  group.querySelectorAll('button,a,span').forEach(item=>{
    if(item.matches('button,[data-delivery-method],[data-tab]'))item.classList.remove('active');
  });
  control.classList.add('active');
}

document.addEventListener('click',event=>{
  const step=event.target.closest('[data-step]');
  if(step){
    const control=step.closest('.stepper');
    if(control){
      const valueNode=control.querySelector('span');
      const previousValue=Number(valueNode.textContent||0);
      const nextValue=Math.max(0,previousValue+(step.dataset.step==='plus'?1:-1));
      const change=nextValue-previousValue;
      valueNode.textContent=nextValue;
      const isQuantityOnly=control.classList.contains('detail-stepper');
      if(!isQuantityOnly){
        const isDelivery=Boolean(step.closest('[data-cart-scope="delivery"]'));
        state[isDelivery?'deliveryCart':'cart']=Math.max(0,state[isDelivery?'deliveryCart':'cart']+change);
        save();updateCounts();
      }
      syncStepper(control);
    }
  }
  const tab=event.target.closest('[data-tab]');
  if(tab){
    setActiveInGroup(tab);
    document.querySelectorAll('[data-category]').forEach(card=>{card.style.display=tab.dataset.tab==='全部'||card.dataset.category===tab.dataset.tab?'block':'none'});
  }
  const option=event.target.closest('[data-option]');
  if(option){
    setActiveInGroup(option);
    textAll('[data-detail-price]',option.dataset.price);
    textAll('[data-selected-option]',option.dataset.option);
  }
  const plainTab=event.target.closest('.order-tabs button,.tabs button:not([data-tab])');
  if(plainTab)setActiveInGroup(plainTab);
  const deliveryMethod=event.target.closest('[data-delivery-method]');
  if(deliveryMethod){
    state.deliveryMethod=deliveryMethod.dataset.deliveryMethod;
    save();updateCounts();showToast(`已切换为${deliveryDetails().label}`);
  }
  const modalTrigger=event.target.closest('[data-open]');
  if(modalTrigger){event.preventDefault();document.getElementById(modalTrigger.dataset.open)?.classList.add('open')}
  if(event.target.closest('[data-close]'))document.querySelectorAll('.modal').forEach(modal=>modal.classList.remove('open'));
  const clear=event.target.closest('[data-clear-cart]');
  if(clear){event.preventDefault();clearCart(clear.dataset.clearCart)}
  const add=event.target.closest('[data-detail-add],[data-detail-add-delivery]');
  if(add){
    const isDelivery=add.matches('[data-detail-add-delivery]');
    const quantity=currentDetailQuantity();
    state[isDelivery?'deliveryCart':'cart']+=quantity;
    save();updateCounts();
    const defaultText=isDelivery?'加入配送购物车':'加入自取购物车';
    add.textContent=isDelivery?'已加入配送购物车':'已加入自取购物车';
    showToast(`${isDelivery?'已加入配送购物车':'已加入自取购物车'} · ${quantity} 件`);
    window.setTimeout(()=>add.textContent=defaultText,1500);
  }
  const action=event.target.closest('[data-confirm-order]');
  if(action){
    const scope=action.dataset.confirmOrder||'delivery';
    if(!finishOrder(scope))return;
    action.disabled=true;action.setAttribute('aria-busy','true');action.textContent='正在提交…';
    window.setTimeout(()=>{location.href='order-success.html'},260);
  }
  const choose=event.target.closest('[data-select-store]');
  if(choose){state.store=choose.dataset.selectStore;save();showToast(`已切换为${state.store}`);window.setTimeout(()=>{location.href='home-refined.html'},180)}
  const chooseAddress=event.target.closest('[data-select-address]');
  if(chooseAddress){state.address=chooseAddress.dataset.selectAddress;save();showToast('已更新默认收货地址');window.setTimeout(()=>{location.href='home-refined.html'},180)}
});

document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.modal.open').forEach(modal=>modal.classList.remove('open'))});
document.addEventListener('DOMContentLoaded',()=>{
  updateStoredLabels();updateCounts();updateSuccessPage();
  document.querySelectorAll('.stepper').forEach(syncStepper);
  document.querySelectorAll('[data-tab],[data-option],[data-delivery-method]').forEach(control=>control.setAttribute('aria-pressed',String(control.classList.contains('active'))));
  document.querySelectorAll('.modal').forEach(modal=>{modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true')});
  document.querySelectorAll('.icon-btn:not([aria-label])').forEach(button=>button.setAttribute('aria-label','更多操作'));
});
