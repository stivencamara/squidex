/*
 * Squidex Headless CMS
 *
 * @license
 * Copyright (c) Squidex UG (haftungsbeschränkt). All rights reserved.
 */

import { Injectable } from '@angular/core';
import '@app/framework/utils/rxjs-extensions';
import { DialogService, getPagingInfo, ListState, shareSubscribed, State } from '@app/shared';
import { Observable, of } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { CreateUserDto, UpdateUserDto, UserDto, UsersService } from './../services/users.service';

interface Snapshot extends ListState<string> {
    // The current users.
    users: ReadonlyArray<UserDto>;

    // The selected user.
    selectedUser?: UserDto | null;

    // Indicates if the user can create a user.
    canCreate?: boolean;
}

export type UsersList = ReadonlyArray<UserDto>;
export type UsersResult = { total: number, users: UsersList };

@Injectable()
export class UsersState extends State<Snapshot> {
    public users =
        this.project(x => x.users);

    public paging =
        this.project(x => getPagingInfo(x, x.users.length));

    public query =
        this.project(x => x.query);

    public selectedUser =
        this.project(x => x.selectedUser);

    public isLoaded =
        this.project(x => x.isLoaded === true);

    public isLoading =
        this.project(x => x.isLoading === true);

    public canCreate =
        this.project(x => x.canCreate === true);

    constructor(
        private readonly dialogs: DialogService,
        private readonly usersService: UsersService
    ) {
        super({
            users: [],
            page: 0,
            pageSize: 10,
            total: 0
        });
    }

    public select(id: string | null): Observable<UserDto | null> {
        return this.loadUser(id).pipe(
            tap(selectedUser => {
                this.next({ selectedUser });
            }),
            shareSubscribed(this.dialogs, { silent: true }));
    }

    private loadUser(id: string | null) {
        if (!id) {
            return of(null);
        }

        const found = this.snapshot.users.find(x => x.id === id);

        if (found) {
            return of(found);
        }

        return this.usersService.getUser(id).pipe(catchError(() => of(null)));
    }

    public load(isReload = false, update: Partial<Snapshot> = {}): Observable<any> {
        if (!isReload) {
            this.resetState({ selectedUser: this.snapshot.selectedUser, ...update });
        }

        return this.loadInternal(isReload);
    }

    private loadInternal(isReload: boolean): Observable<any> {
        this.next({ isLoading: true });

        const { page, pageSize, query } = this.snapshot;

        return this.usersService.getUsers(
                pageSize,
                pageSize * page,
                query).pipe(
            tap(({ total, items: users, canCreate }) => {
                if (isReload) {
                    this.dialogs.notifyInfo('i18n:users.reloaded');
                }

                this.next(s => {
                    let selectedUser = s.selectedUser;

                    if (selectedUser) {
                        selectedUser = users.find(x => x.id === selectedUser!.id) || selectedUser;
                    }

                    return { ...s,
                        canCreate,
                        users,
                        isLoaded: true,
                        isLoading: false,
                        selectedUser,
                        total
                    };
                });
            }),
            finalize(() => {
                this.next({ isLoading: false });
            }),
            shareSubscribed(this.dialogs));
    }

    public create(request: CreateUserDto): Observable<UserDto> {
        return this.usersService.postUser(request).pipe(
            tap(created => {
                this.next(s => {
                    const users = [created, ...s.users].slice(0, s.pageSize);

                    return { ...s, users, total: s.total + 1 };
                });
            }),
            shareSubscribed(this.dialogs, { silent: true }));
    }

    public update(user: UserDto, request: UpdateUserDto): Observable<UserDto> {
        return this.usersService.putUser(user, request).pipe(
            tap(updated => {
                this.replaceUser(updated);
            }),
            shareSubscribed(this.dialogs));
    }

    public lock(user: UserDto): Observable<UserDto> {
        return this.usersService.lockUser(user).pipe(
            tap(updated => {
                this.replaceUser(updated);
            }),
            shareSubscribed(this.dialogs));
    }

    public unlock(user: UserDto): Observable<UserDto> {
        return this.usersService.unlockUser(user).pipe(
            tap(updated => {
                this.replaceUser(updated);
            }),
            shareSubscribed(this.dialogs));
    }

    public search(query: string): Observable<UsersResult> {
        this.next({ query, page: 0 });

        return this.loadInternal(false);
    }

    public page(paging: { page: number, pageSize: number }) {
        this.next(paging);

        return this.loadInternal(false);
    }

    private replaceUser(user: UserDto) {
        return this.next(s => {
            const users = s.users.map(u => u.id === user.id ? user : u);

            const selectedUser =
                s.selectedUser?.id !== user.id ?
                s.selectedUser :
                users.find(x => x.id === user.id);

            return { ...s, users, selectedUser };
        });
    }
}