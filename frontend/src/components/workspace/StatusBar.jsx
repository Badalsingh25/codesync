
const StatusBar = ({ connectionStatus, roomCode, editorLine, editorCol, language, isMobile = false }) => {
  const isConnected  = connectionStatus === 'CONNECTED';
  const isConnecting = connectionStatus === 'CONNECTING';
  const bgClass = isConnected ? 'bg-indigo-600' : isConnecting ? 'bg-amber-600' : 'bg-red-700';

  const itemClass = "flex items-center px-2.5 h-full cursor-pointer text-[11.5px] text-white whitespace-nowrap hover:bg-black/15 transition-colors";

  return (
    <div 
      className={`h-[22px] flex items-center justify-between text-white select-none overflow-hidden ${bgClass}`}
      style={{ gridArea: 'status' }}
    >
      <div className="flex items-center h-full">
        <div className={`${itemClass} gap-1.5`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-300' : 'bg-amber-200'}`} />
          {isMobile
            ? (isConnected ? '⚡ Live' : isConnecting ? '…' : '● Offline')
            : (isConnected ? '⚡ Live Sync' : isConnecting ? 'Connecting…' : '● Offline')}
        </div>
        {/* "main" branch indicator and room code are secondary info that
            crowds out the connection status on a narrow screen — the
            room code is already visible in the sidebar/header. */}
        {!isMobile && (
          <div className={itemClass}>
            ⊞ main
          </div>
        )}
        {!isMobile && roomCode && (
          <div className={itemClass}>
            Room: {roomCode}
          </div>
        )}
      </div>
      <div className="flex items-center h-full">
        {(isMobile
          ? [language?.toUpperCase()]
          : [
              `Ln ${editorLine}, Col ${editorCol}`,
              language?.toUpperCase(),
              'UTF-8',
              'Spaces: 4',
            ]
        ).map(label => (
          <div key={label} className={itemClass}>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusBar;
