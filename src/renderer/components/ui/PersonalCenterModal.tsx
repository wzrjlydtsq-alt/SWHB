import { useEffect, useState } from 'react'
import {
  Eye,
  LogIn,
  LogOut,
  Shield,
  Users,
  X
} from 'lucide-react'
import {
  authApi,
  clearSession,
  getUserInfo,
  saveCloudContext,
  saveUserInfo,
  teamCanvasApi,
  teamsApi,
  usersApi
} from '../../services/cloud'
import type { CloudTeam, TeamMember } from '../../services/cloud'
import { isCloudMemberOnline, setStoredCloudTeamId } from '../../services/cloud/teamSelection'
import './PersonalCenterModal.css'

type PersonalCenterTab = 'teams'
const DEFAULT_ENTERPRISE_ID = 7
const TEAM_PRESENCE_REFRESH_MS = 15000

const ENTERPRISE_OPTIONS = ['星河智绘默认工作室']

export function PersonalCenterModal({
  onClose,
  onChanged
}: {
  onClose: () => void
  onChanged: () => void
}) {
  const [activeTab, setActiveTab] = useState<PersonalCenterTab>('teams')
  const [user, setUser] = useState(getUserInfo())
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [teams, setTeams] = useState<CloudTeam[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginMode, setLoginMode] = useState<'platform' | 'enterprise'>('platform')
  const [entName, setEntName] = useState(ENTERPRISE_OPTIONS[0])
  const [entStep, setEntStep] = useState<'name' | 'credentials'>('name')
  const [entId, setEntId] = useState<number | null>(null)
  const [entDisplayName, setEntDisplayName] = useState('')
  const [entUsername, setEntUsername] = useState('')
  const [entPassword, setEntPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null
  const canManageTeam = selectedTeam?.role === 'owner' || selectedTeam?.role === 'admin'
  const canInspectTeamCanvas = ['owner', 'admin', 'emergency_admin', 'head_director'].includes(selectedTeam?.role || '')

  const persistCloudContext = (team?: CloudTeam | null) => {
    const currentUser = getUserInfo()
    if (!currentUser) return
    saveCloudContext({
      userId: currentUser.id,
      teamId: team?.id || null,
      orgId: team?.org_id || null,
      role: team?.role || null,
      teamName: team?.name || null,
      orgName: null
    })
    if (team?.id) setStoredCloudTeamId(team.id)
  }

  const loadUser = async () => {
    const nextUser = await usersApi.getMe()
    saveUserInfo(nextUser)
    setUser(nextUser)
    setNickname(nextUser.nickname || '')
    onChanged()
  }

  const loadTeams = async () => {
    const nextTeams = await teamsApi.list()
    setTeams(nextTeams)
    const nextTeam =
      nextTeams.find((team) => team.id === selectedTeamId) || nextTeams[0] || null
    setSelectedTeamId(nextTeam?.id || null)
    persistCloudContext(nextTeam)
  }

  const loadMembers = async (teamId?: number | null) => {
    if (!teamId) {
      setMembers([])
      return
    }
    await teamsApi.updatePresence(teamId).catch(() => {})
    setMembers(await teamsApi.getMembers(teamId))
  }

  const resetToLogin = (hint?: string) => {
    clearSession()
    setUser(null)
    setTeams([])
    setMembers([])
    setMessage(hint || '登录已过期，请重新登录')
  }

  const refreshAll = async () => {
    if (!user && !getUserInfo()) return
    setLoading(true)
    setMessage('')
    try {
      await Promise.all([loadUser(), loadTeams()])
    } catch (error) {
      resetToLogin(error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    const cleanup = window.api?.on?.('auth:platform-callback', (callbackUrl) => {
      if (typeof callbackUrl === 'string') {
        handlePlatformCallback(callbackUrl)
      }
    })
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    if (user) loadMembers(selectedTeam?.id).catch(() => setMembers([]))
  }, [user, selectedTeam?.id])

  useEffect(() => {
    if (!user || !selectedTeam?.id) return
    let alive = true
    let timer: number | null = null

    const syncPresence = async () => {
      try {
        await teamsApi.updatePresence(selectedTeam.id)
        const nextMembers = await teamsApi.getMembers(selectedTeam.id)
        if (alive) setMembers(nextMembers)
      } catch {
        // Presence is best-effort; member management should not be blocked by network jitter.
      }
    }

    void syncPresence()
    timer = window.setInterval(syncPresence, TEAM_PRESENCE_REFRESH_MS)
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
    }
  }, [user?.id, selectedTeam?.id])

  const runAction = async (action: () => Promise<void>, success: string) => {
    setLoading(true)
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const checkEnterprise = async () => {
    const name = entName.trim()
    if (!name) return
    setLoading(true)
    setLoginMessage('')
    try {
      const result = await authApi.checkEnterprise(name)
      if (result.exists && result.enterprise_id) {
        setEntId(result.enterprise_id)
        setEntDisplayName(result.display_name || name)
        setEntStep('credentials')
        setLoginMessage('')
      } else if (ENTERPRISE_OPTIONS.includes(name)) {
        setEntId(DEFAULT_ENTERPRISE_ID)
        setEntDisplayName(name)
        setEntStep('credentials')
        setLoginMessage('')
      } else {
        setLoginMessage('未找到该企业，请检查企业名称是否正确')
      }
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : '查询企业失败')
    } finally {
      setLoading(false)
    }
  }

  const enterpriseLogin = async () => {
    if (!entId || !entUsername.trim() || !entPassword.trim()) return
    setLoading(true)
    setLoginMessage('')
    try {
      const data = await authApi.enterpriseLogin({
        enterprise_id: entId,
        username: entUsername.trim(),
        password: entPassword.trim()
      })
      setUser(data.user)
      setNickname(data.user.nickname || '')
      setMessage('已登录')
      onChanged()
      await loadTeams()
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  const openPlatformLogin = async () => {
    setLoading(true)
    setLoginMessage('已打开灵境星河账号登录页，请在浏览器完成登录')
    try {
      await window.api?.invoke?.('auth:open-platform-login')
    } catch (error) {
      const loginUrl = new URL('https://www.lingjingxinghe.cn/login')
      loginUrl.searchParams.set('client', 'xinghe-zhihui-desktop')
      loginUrl.searchParams.set('redirect_uri', 'xinghe-zhihui://auth/callback')
      loginUrl.searchParams.set('state', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      window.open(loginUrl.toString(), '_blank', 'noopener,noreferrer')
      setLoginMessage('已打开灵境星河账号登录页，请在浏览器完成登录')
    } finally {
      setLoading(false)
    }
  }

  const handlePlatformCallback = async (callbackUrl: string) => {
    setLoading(true)
    setLoginMessage('正在关联灵境星河账号...')
    try {
      const url = new URL(callbackUrl)
      const error = url.searchParams.get('error')
      if (error) throw new Error(error)

      const ticket = url.searchParams.get('ticket')
      if (!ticket) throw new Error('登录回调缺少 ticket')

      const data = await authApi.platformLogin({
        ticket,
        phone: url.searchParams.get('phone') || undefined,
        email: url.searchParams.get('email') || undefined,
        nickname: url.searchParams.get('nickname') || undefined,
        avatar_url: url.searchParams.get('avatar_url') || undefined
      })

      setUser(data.user)
      setNickname(data.user.nickname || '')
      setMessage('灵境星河账号已登录')
      onChanged()
      await loadTeams()
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : '平台登录失败')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await runAction(async () => {
      try {
        await authApi.logout()
      } catch {
        clearSession()
      }
      resetToLogin('已退出登录')
      onChanged()
    }, '已退出登录')
  }

  const selectTeam = (teamId: number) => {
    const team = teams.find((item) => item.id === teamId) || null
    setSelectedTeamId(teamId)
    persistCloudContext(team)
    onChanged()
    setMessage('当前小组已切换')
  }

  const removeMember = (member: TeamMember) =>
    runAction(async () => {
      if (!selectedTeam || member.role === 'owner') return
      await teamsApi.removeMember(selectedTeam.id, member.user_id)
      await loadMembers(selectedTeam.id)
    }, '成员已移除')

  const inspectMemberCanvas = async (member: TeamMember) => {
    if (!selectedTeam || !canInspectTeamCanvas) return
    if (member.user_id === user?.id) {
      setMessage('这是你自己的画布，直接回到工作区查看即可')
      return
    }
    if (!isCloudMemberOnline(member, user?.id)) {
      setMessage('该成员当前不在线，暂时不能进入他的画布观察')
      return
    }

    setLoading(true)
    setMessage('正在请求成员画布快照...')
    try {
      const snapshot = await teamCanvasApi.getMemberSnapshot(selectedTeam.id, member.user_id)
      if (snapshot.snapshot_url) {
        window.open(snapshot.snapshot_url, '_blank', 'noopener,noreferrer')
        setMessage(`已打开 ${member.nickname || `用户 ${member.user_id}`} 的画布快照`)
        return
      }
      setMessage('后端已响应，但还没有返回可打开的画布快照')
    } catch (error: any) {
      const status = Number(error?.status || error?.code || 0)
      if ([404, 405, 501, 50000].includes(status)) {
        setMessage('云端画布观察接口还没接入，已保留组长点击入口')
      } else {
        setMessage(error?.message || '请求成员画布失败')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pc-overlay" onMouseDown={onClose}>
      <div className={`pc-modal ${!user ? 'pc-modal-login' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="pc-header">
          <div>
            <h2>个人中心</h2>
            <span>{user?.phone || user?.email || '云端协作账号'}</span>
          </div>
          <button className="pc-icon-btn" onClick={onClose} aria-label="关闭个人中心">
            <X size={18} />
          </button>
        </header>

        <div className={`pc-shell ${!user ? 'pc-shell-login' : ''}`}>
          {user && (
            <nav className="pc-tabs" aria-label="个人中心导航">
              <button className={activeTab === 'teams' ? 'active' : ''} onClick={() => setActiveTab('teams')}>
                <Users size={15} /> 我的小组
              </button>
            </nav>
          )}

          <main className="pc-content">
            {!user && (
              <section className="pc-panel pc-login-panel">
                <div className="pc-login-card">
                  <div className="pc-login-title">
                    <span className="pc-login-icon">
                      <LogIn size={18} />
                    </span>
                    <div>
                      <h3>登录云端账号</h3>
                      <span>独立写作软件和素材中心会共用这一次登录。</span>
                    </div>
                  </div>

                  {/* 登录方式 Tab */}
                  <div className="pc-login-tabs">
                    <button
                      className={loginMode === 'platform' ? 'active' : ''}
                      onClick={() => { setLoginMode('platform'); setLoginMessage('') }}
                    >
                      灵境星河账号
                      <small>官网账号</small>
                    </button>
                    <button
                      className={loginMode === 'enterprise' ? 'active' : ''}
                      onClick={() => { setLoginMode('enterprise'); setLoginMessage('') }}
                    >
                      企业账号
                      <small>团队后台</small>
                    </button>
                  </div>

                  {/* 灵境星河账号登录 */}
                  {loginMode === 'platform' && (
                    <div className="pc-login-method">
                      <p>
                        跳转到灵境星河官网完成登录，成功后自动回到桌面端。
                      </p>
                      <button className="pc-login-submit pc-platform-login" onClick={openPlatformLogin} disabled={loading}>
                        {loading ? '等待登录回调...' : '打开灵境星河登录'}
                      </button>
                    </div>
                  )}

                  {/* 企业登录 */}
                  {loginMode === 'enterprise' && entStep === 'name' && (
                    <div className="pc-login-method">
                      <p>使用云端管理后台里的企业和成员账号登录。</p>
                      <label className="pc-login-field">
                        <span>企业名称</span>
                        <select
                          value={entName}
                          onChange={(e) => setEntName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && checkEnterprise()}
                        >
                          <option value="">请选择企业</option>
                          {ENTERPRISE_OPTIONS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="pc-login-submit pc-primary"
                        onClick={checkEnterprise}
                        disabled={loading || !entName.trim()}
                      >
                        {loading ? '查询中...' : '下一步'}
                      </button>
                    </div>
                  )}

                  {loginMode === 'enterprise' && entStep === 'credentials' && (
                    <div className="pc-login-method">
                      <div className="pc-ent-badge">
                        <Shield size={14} />
                        <span>{entDisplayName}</span>
                        <button onClick={() => { setEntStep('name'); setEntId(null); setEntUsername(''); setEntPassword(''); setLoginMessage('') }}>更换</button>
                      </div>
                      <label className="pc-login-field">
                        <span>用户名（姓名）</span>
                        <input
                          value={entUsername}
                          onChange={(e) => setEntUsername(e.target.value)}
                          placeholder="请输入您的姓名"
                        />
                      </label>
                      <label className="pc-login-field">
                        <span>密码</span>
                        <input
                          type="password"
                          value={entPassword}
                          onChange={(e) => setEntPassword(e.target.value)}
                          placeholder="请输入密码"
                          onKeyDown={(e) => e.key === 'Enter' && enterpriseLogin()}
                        />
                      </label>
                      <button
                        className="pc-login-submit pc-primary"
                        onClick={enterpriseLogin}
                        disabled={loading || !entUsername.trim() || !entPassword.trim()}
                      >
                        {loading ? '登录中...' : '登录'}
                      </button>
                    </div>
                  )}

                  <p className="pc-login-message">{loginMessage || message}</p>
                </div>
              </section>
            )}

            {user && activeTab === 'teams' && (
              <section className="pc-panel pc-two-col">
                <div>
                  <div className="pc-section-head">
                    <h3>小组列表</h3>
                    <span>{teams.length} 个小组</span>
                  </div>
                  <div className="pc-list">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        className={selectedTeam?.id === team.id ? 'active' : ''}
                        onClick={() => selectTeam(team.id)}
                      >
                        <strong>{team.name}</strong>
                        <small>{team.role || 'member'} · {team.member_count} 人</small>
                      </button>
                    ))}
                    {teams.length === 0 && <p className="pc-empty">当前账号还没有可用小组。</p>}
                  </div>
                </div>
                <div>
                  <div className="pc-section-head">
                    <h3>成员</h3>
                    <span>{selectedTeam?.name || '未选择小组'}</span>
                  </div>
                  <MemberList
                    members={members}
                    canManageTeam={canManageTeam}
                    canInspectTeamCanvas={canInspectTeamCanvas}
                    currentUserId={user.id}
                    onRemove={removeMember}
                    onInspectCanvas={inspectMemberCanvas}
                  />
                </div>
              </section>
            )}
          </main>
        </div>

        <footer className="pc-footer">
          <span>{loading ? '处理中...' : message}</span>
          <div className="pc-footer-actions">
            <button onClick={refreshAll} disabled={loading || !user}>刷新</button>
            <button className="pc-danger" onClick={logout} disabled={loading || !user}>
              <LogOut size={14} /> 退出登录
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function MemberList({
  members,
  canManageTeam,
  canInspectTeamCanvas,
  currentUserId,
  onRemove,
  onInspectCanvas
}: {
  members: TeamMember[]
  canManageTeam: boolean
  canInspectTeamCanvas: boolean
  currentUserId: number
  onRemove: (member: TeamMember) => void
  onInspectCanvas: (member: TeamMember) => void
}) {
  return (
    <div className="pc-member-list">
      <div className="pc-section-head">
        <h3>成员</h3>
        <span>{members.length} 人</span>
      </div>
      <div className="pc-member-grid">
        {members.map((member) => {
          const online = isMemberOnline(member, currentUserId)
          const canInspect = canInspectTeamCanvas && online && member.user_id !== currentUserId
          return (
            <div
              className={`pc-member-card ${canInspect ? 'can-inspect' : ''}`}
              key={member.user_id}
              role={canInspect ? 'button' : undefined}
              tabIndex={canInspect ? 0 : undefined}
              title={canInspect ? '查看该成员画布' : online ? '在线' : '离线'}
              onClick={() => canInspect && onInspectCanvas(member)}
              onKeyDown={(event) => {
                if (canInspect && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onInspectCanvas(member)
                }
              }}
            >
              {online && <span className="pc-online-dot" title="在线" />}
              {canInspect && <span className="pc-inspect-badge" title="查看画布"><Eye size={11} /></span>}
              <div className="pc-card-avatar">
                {member.avatar_url
                  ? <img src={member.avatar_url} alt="" />
                  : (member.nickname || '?').slice(0, 1)
                }
              </div>
              <span className="pc-card-name">{member.nickname || `用户 ${member.user_id}`}</span>
              <span className={`pc-card-role ${member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : ''}`}>
                {member.role === 'owner' ? '创建者' : member.role === 'admin' ? '管理员' : '成员'}
              </span>
              {canManageTeam && member.role !== 'owner' && (
                <button className="pc-card-remove" onClick={() => onRemove(member)} title="移除成员">
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
        {members.length === 0 && <span className="pc-empty" style={{ gridColumn: '1 / -1' }}>暂无成员</span>}
      </div>
    </div>
  )
}

function isMemberOnline(member: TeamMember, currentUserId: number) {
  return isCloudMemberOnline(member, currentUserId)
}

function Avatar({ member }: { member: Pick<TeamMember, 'nickname' | 'avatar_url'> }) {
  if (member.avatar_url) return <img className="pc-mini-avatar" src={member.avatar_url} alt="" />
  return <span className="pc-mini-avatar">{(member.nickname || '?').slice(0, 1)}</span>
}
