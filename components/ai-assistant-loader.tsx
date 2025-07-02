"use client"

interface AIAssistantLoaderProps {
  size?: number
}

export function AIAssistantLoader({ size = 40 }: AIAssistantLoaderProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="ai-loader-container"
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
      >
        <div className="ai-loader"></div>
      </div>
      <style jsx>{`
        .ai-loader-container {
          border-radius: 50%;
          background: linear-gradient(165deg, rgba(255,255,255,1) 0%, rgb(220, 220, 220) 40%, rgb(170, 170, 170) 98%, rgb(10, 10, 10) 100%);
          position: relative;
        }

        .ai-loader:before {
          position: absolute;
          content: '';
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border-bottom: 0 solid #ffffff05;
          top: 0;
          left: 0;
          box-shadow: 
            0 -10px 20px 20px #ffffff40 inset,
            0 -5px 15px 10px #ffffff50 inset,
            0 -2px 5px #ffffff80 inset,
            0 -3px 2px #ffffffBB inset,
            0 2px 0px #ffffff,
            0 2px 3px #ffffff,
            0 5px 5px #ffffff90,
            0 10px 15px #ffffff60,
            0 10px 20px 20px #ffffff40;
          filter: blur(2px);
          animation: 2s rotate linear infinite;
        }

        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
