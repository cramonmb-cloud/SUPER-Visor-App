import React, { useState, useEffect } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const CachedImage: React.FC<CachedImageProps> = ({ src, className, fallback, ...props }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImgSrc(null);
      return;
    }

    setLoading(true);
    setError(false);
    setImgSrc(null); // Clear previous image
    
    let isMounted = true;
    const cacheName = 'visor-image-cache-v1';

    async function loadImage() {
      // 1. Try to open the cache
      let cache: Cache | null = null;
      try {
        cache = await caches.open(cacheName);
      } catch (e) {
        // Cache API not available? Just use original URL
        if (isMounted) {
          setImgSrc(src);
          setLoading(false);
        }
        return;
      }

      try {
        // 2. Check Cache API for the image
        const cachedResponse = await cache.match(src);

        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          const localUrl = URL.createObjectURL(blob);
          if (isMounted) {
            setImgSrc(localUrl);
            setLoading(false);
          }
          return;
        }

        // 3. Not in cache: Show original image immediately while we try to cache it
        if (isMounted) {
          setImgSrc(src);
          // Note: we don't set loading to false yet, we'll let the <img> tag's onLoad handle it
        }

        // 4. Try to fetch and cache in the background SILENTLY
        // This might fail due to CORS, which is handled in the catch block
        const response = await fetch(src);
        if (response.ok) {
          const responseToCache = response.clone();
          await cache.put(src, responseToCache);
          
          // Optional: update to blob URL for future loads, but since we already set src, 
          // we'll just let the current img tag keep loading from the network.
        }
      } catch (err) {
        // Silicon Valley "Fail Silence" - CORS often blocks manual fetch
        if (isMounted) {
          setImgSrc(src);
        }
      }
    }

    loadImage();

    return () => {
      isMounted = false;
      if (imgSrc && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [src]);

  if (!src) return (
    <div className={`bg-slate-100 flex items-center justify-center ${className}`}>
        <ImageIcon className="w-6 h-6 text-slate-300" />
    </div>
  );

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 animate-pulse">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      )}
      
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
           <ImageIcon className="w-6 h-6 text-slate-300" />
        </div>
      ) : (
        <img
          {...props}
          src={imgSrc || src}
          className={`w-full h-full object-cover transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
};
