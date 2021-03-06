import * as express from 'express';
import { User } from '../../../../../models/user';
import requestApi from '../../../../../core/request-api';

module.exports = (req: express.Request, res: express.Response): void => {

	const user: User = res.locals.user;
	const me: User = req.user;

	requestApi('users/following', {
		'user-id': user.id
	}, me).then(following => {
		res.locals.display({
			user: user,
			following: following
		});
	});
};
