# Service in Motion

QuickServe's launch screen uses two opening curtains, a full-width top video window, centered editorial text and a bottom-aligned QuickServe status across mobile, tablet and desktop and rounded cutouts of a short local restaurant video. GSAP and masked SplitText reveal the words; a single CSS transform reveals the footage. A single 3.33-second H.264 video combines two Pexels clips (102 KiB, no audio) to avoid decoding multiple streams. The current application remains React; Webflow, scrolling libraries and scroll triggers are not needed for this short standalone loading screen.

## Footage and license

- Chef plating: Los Muertos Crew, Pexels, https://www.pexels.com/video/person-putting-salt-on-the-food-8477270/
- Waiter serving: Denys Gromov, Pexels, https://www.pexels.com/video/waiter-serving-meal-to-the-customer-5223106/
- Pexels permits free use and modification of photos and videos: https://www.pexels.com/license/ . Clips have been shortened and compressed for the loader; attribution is included here.

No third-party request, account or paid service is needed at runtime. The local poster provides a still image during boot, reduced motion, Save Data, blocked autoplay or video failure. Video plays muted and inline once at 0.8× speed, pauses when hidden and is released on unmount. The entry waits at least 4.7 seconds, then closes once the router is ready and video playback has ended or is unavailable; at 5.6 seconds it yields to the page’s own loading or error controls. Recovery is exposed by 6.2 seconds if a pending screen remains. A document-scoped marker (with an in-memory fallback when storage is blocked) prevents the startup animation from replaying on later route transitions. Reduced-motion settings disable text, panel and indicator animations. Navigation updates that leave motion enabled do not restart or interrupt the sequence.

## Verification

Check mobile, desktop and landscape layout; actual video time progression; reduced motion and Save Data; video error and autoplay rejection; visibility pause/resume; and launch recovery. Browser autoplay and decoding depend on device settings; the poster remains if playback cannot start. Test results do not guarantee performance on all phones.
