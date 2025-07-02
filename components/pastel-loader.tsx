"use client"

interface PastelLoaderProps {
  size?: number
}

export function PastelLoader({ size = 40 }: PastelLoaderProps) {
  return (
    <div className="flex items-center justify-center">
      <div
        className="pastel-loader-container"
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
      >
        <div className="pastel-loader"></div>
      </div>
      <style jsx>{`
        .pastel-loader-container {
          border-radius: 50%;
          background: linear-gradient(165deg, 
            rgba(255, 182, 193, 0.8) 0%, 
            rgba(221, 160, 221, 0.8) 25%, 
            rgba(173, 216, 230, 0.8) 50%, 
            rgba(255, 218, 185, 0.8) 75%, 
            rgba(152, 251, 152, 0.8) 100%
          );
          position: relative;
          animation: 3s colorShift linear infinite;
        }

        .pastel-loader:before {
          position: absolute;
          content: '';
          width: 100%;
          height: 100%;
          border-radius: 50%;
          top: 0;
          left: 0;
          box-shadow: 
            0 -8px 16px 16px rgba(255, 255, 255, 0.3) inset,
            0 -4px 12px 8px rgba(255, 255, 255, 0.4) inset,
            0 -2px 4px rgba(255, 255, 255, 0.6) inset,
            0 2px 0px rgba(255, 255, 255, 0.8),
            0 4px 8px rgba(255, 255, 255, 0.5),
            0 8px 16px rgba(255, 255, 255, 0.3);
          filter: blur(1px);
          animation: 2s rotate linear infinite;
        }

        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes colorShift {
          0% {
            background: linear-gradient(165deg, 
              rgba(255, 182, 193, 0.8) 0%, 
              rgba(221, 160, 221, 0.8) 25%, 
              rgba(173, 216, 230, 0.8) 50%, 
              rgba(255, 218, 185, 0.8) 75%, 
              rgba(152, 251, 152, 0.8) 100%
            );
          }
          25% {
            background: linear-gradient(165deg, 
              rgba(221, 160, 221, 0.8) 0%, 
              rgba(173, 216, 230, 0.8) 25%, 
              rgba(255, 218, 185, 0.8) 50%, 
              rgba(152, 251, 152, 0.8) 75%, 
              rgba(255, 182, 193, 0.8) 100%
            );
          }
          50% {
            background: linear-gradient(165deg, 
              rgba(173, 216, 230, 0.8) 0%, 
              rgba(255, 218, 185, 0.8) 25%, 
              rgba(152, 251, 152, 0.8) 50%, 
              rgba(255, 182, 193, 0.8) 75%, 
              rgba(221, 160, 221, 0.8) 100%
            );
          }
          75% {
            background: linear-gradient(165deg, 
              rgba(255, 218, 185, 0.8) 0%, 
              rgba(152, 251, 152, 0.8) 25%, 
              rgba(255, 182, 193, 0.8) 50%, 
              rgba(221, 160, 221, 0.8) 75%, 
              rgba(173, 216, 230, 0.8) 100%
            );
          }
          100% {
            background: linear-gradient(165deg, 
              rgba(152, 251, 152, 0.8) 0%, 
              rgba(255, 182, 193, 0.8) 25%, 
              rgba(221, 160, 221, 0.8) 50%, 
              rgba(173, 216, 230, 0.8) 75%, 
              rgba(255, 218, 185, 0.8) 100%
            );
          }
        }
      `}</style>
    </div>
  )
}
