# Service in Motion

QuickServe's launch screen uses an opening black-to-white panel, bold editorial text and rounded cutouts of a short local restaurant video. GSAP and SplitText animate the text. A single 3.33-second H.264 video combines two Pexels clips (102 KiB, no audio) to avoid decoding multiple streams. The current application remains React; Webflow, scrolling libraries and scroll triggers are not needed for this short standalone loading screen.

## Footage and license

- Chef plating: Los Muertos Crew, Pexels, https://www.pexels.com/video/person-putting-salt-on-the-food-8477270/
- Waiter serving: Denys Gromov, Pexels, https://www.pexels.com/video/waiter-serving-meal-to-the-customer-5223106/
- Pexels permits free use and modification of photos and videos: https://www.pexels.com/license/ . Clips have been shortened and compressed for the loader; attribution is included here.

No third-party request, account or paid service is needed at runtime. The local poster provides a still image during boot, reduced motion, Save Data, blocked autoplay or video failure. Video plays muted and inline, pauses when hidden and is released on unmount. The pre-existing launch coordination, 3.5–3.9 second timing, and recovery controls remain. Reduced-motion settings disable text, panel and indicator animations.

## Verification

Check mobile, desktop and landscape layout; actual video time progression; reduced motion and Save Data; video error and autoplay rejection; visibility pause/resume; and launch recovery. Browser autoplay and decoding depend on device settings; the poster remains if playback cannot start. Test results do not guarantee performance on all phones.
