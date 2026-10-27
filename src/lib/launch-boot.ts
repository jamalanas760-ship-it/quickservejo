/** State shared by the pre-hydration boot and the hydrated entry overlay. */
export type LaunchBootState = {
  startedAt: number;
  currentTime: number;
  ended: boolean;
  failed: boolean;
  stopped: boolean;
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
    var root=document.getElementById('qs-boot');
    var view=root&&root.querySelector('.qs-launch-simple');
    var video=root&&root.querySelector('video');
    var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var saveData=navigator.connection&&navigator.connection.saveData;
    if(!view||!video||reduced||saveData||document.documentElement.dataset.qsNavigationMotion==='reduced')return;
    var controller=new AbortController(),url=null,released=false,timer;
    var state={startedAt:performance.now(),currentTime:0,ended:false,failed:false,stopped:false,sourceReady:null,stop:function(){
      if(state.stopped)return;
      state.currentTime=video.currentTime||0; state.ended=video.ended; state.stopped=true;
      document.removeEventListener('visibilitychange',visibility);
      video.pause(); video.removeAttribute('src'); video.load();
    },release:function(){
      if(released)return;
      released=true; clearTimeout(timer); controller.abort();
      if(url){URL.revokeObjectURL(url);url=null}
    }};
    function visibility(){if(document.hidden)video.pause();else if(!video.ended&&video.getAttribute('src'))video.play().catch(function(){state.failed=true})}
    window.__qsLaunchBoot=state;
    document.addEventListener('visibilitychange',visibility);
    view.classList.add('qs-motion-active');
    video.defaultMuted=true; video.muted=true; video.defaultPlaybackRate=.8;
    state.sourceReady=fetch('/loading/service-motion/service.mp4',{signal:controller.signal})
      .then(function(response){if(!response.ok)throw Error('video unavailable');return response.blob()})
      .then(function(blob){
        if(released)return null;
        url=URL.createObjectURL(blob);
        if(!state.stopped){video.src=url;video.load();video.playbackRate=.8;if(!document.hidden)video.play().catch(function(){state.failed=true})}
        return url;
      }).catch(function(){state.failed=true;return null});
    timer=setTimeout(state.release,10000);
  } catch(e) { /* The static poster and recovery screen remain available. */ }
})();`;

/** Stop the boot video before the application takes over, keeping its playhead. */
export function stopLaunchBoot(): void {
  window.__qsLaunchBoot?.stop();
}
