/** State shared by the pre-hydration boot and the hydrated entry overlay. */
export type LaunchBootState = {
  startedAt: number;
  currentTime: number;
  ended: boolean;
  failed: boolean;
  stopped: boolean;
  source: string | null;
  sourceReady: Promise<string | null>;
  stop: () => void;
  release: () => void;
};
declare global {
  interface Window {
    __qsLaunchBoot?: LaunchBootState;
  }
}

/** Runs immediately after the server-rendered boot markup, before hydration. */
export const LAUNCH_BOOT_SCRIPT = `(function(){
  try {
    // A deliberate loader-only choice takes precedence over inherited motion
    // preferences, without changing operating-system or workspace settings.
    var choice=null;
    try{choice=new URLSearchParams(window.location.search).get('loadingAnimation')}catch(e){}
    if(choice==='on'){
      document.documentElement.dataset.qsLaunchMotion='full';
      try{window.localStorage.setItem('quickserve.launch.motion','full')}catch(e){}
    }else if(choice==='auto'){
      delete document.documentElement.dataset.qsLaunchMotion;
      try{window.localStorage.removeItem('quickserve.launch.motion')}catch(e){}
    }else{
      try{if(window.localStorage.getItem('quickserve.launch.motion')==='full')document.documentElement.dataset.qsLaunchMotion='full'}catch(e){}
    }
    var root=document.getElementById('qs-boot');
    var view=root&&root.querySelector('.qs-launch-simple');
    var video=root&&root.querySelector('video');
    var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var saveData=navigator.connection&&navigator.connection.saveData;
    var explicit=document.documentElement.dataset.qsLaunchMotion==='full';
    if(!view||!video||(!explicit&&(reduced||saveData||document.documentElement.dataset.qsNavigationMotion==='reduced')))return;
    var controller=new AbortController(),url=null,released=false,timer;
    var state={startedAt:performance.now(),currentTime:0,ended:false,failed:false,stopped:false,source:null,sourceReady:null,stop:function(){
      if(state.stopped)return;
      state.currentTime=video.currentTime||0; state.ended=video.ended; state.stopped=true;
      document.removeEventListener('visibilitychange',visibility);
      video.pause(); video.removeAttribute('src'); video.load();
    },release:function(){
      if(released)return;
      released=true; clearTimeout(timer); controller.abort();
      if(url){URL.revokeObjectURL(url);url=null;state.source=null}
    }};
    function visibility(){if(document.hidden)video.pause();else if(!video.ended&&video.getAttribute('src'))video.play().catch(function(){state.failed=true})}
    window.__qsLaunchBoot=state;
    document.addEventListener('visibilitychange',visibility);
    view.classList.add('qs-motion-active');
    video.defaultMuted=true; video.muted=true; video.defaultPlaybackRate=.8;
    // Let the media element stream immediately. A fetch/blob round trip must
    // never hold the visible loader on its poster for the entire launch.
    video.src='/loading/service-motion/service.mp4';video.load();video.playbackRate=.8;
    if(!document.hidden)video.play().catch(function(){state.failed=true});
    state.sourceReady=fetch('/loading/service-motion/service.mp4',{signal:controller.signal})
      .then(function(response){if(!response.ok)throw Error('video unavailable');return response.blob()})
      .then(function(blob){
        if(released)return null;
        url=URL.createObjectURL(blob);
        state.source=url;
        return url;
      }).catch(function(){state.failed=true;return null});
    timer=setTimeout(state.release,10000);
  } catch(e) { /* The static poster and recovery screen remain available. */ }
})();`;

/** Stop the boot video before the application takes over, keeping its playhead. */
export function stopLaunchBoot(): void {
  window.__qsLaunchBoot?.stop();
}
